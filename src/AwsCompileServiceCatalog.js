'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

class AwsCompileServiceCatalog {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    const servicePath = this.serverless.config.servicePath || '';
    this.packagePath = this.serverless.service.package.path
      || path.join(servicePath || '.', '.serverless');
    this.provider = this.serverless.getProvider('aws');

    // key off the ServiceCatalog Product ID
    if ('scProductId' in this.serverless.service.provider) {
      this.hooks = {
        'before:package:finalize': () => BbPromise.bind(this)
          .then(this.compileFunctions),
      };
      this.serverless.cli.log('AwsCompileServiceCatalog');
      // clear out any other aws plugins
      if (this.serverless.pluginManager.hooks['package:compileEvents']) {
        this.serverless.pluginManager.hooks['package:compileEvents'].length = 0;
      }
      if (this.serverless.pluginManager.hooks['package:compileFunctions']) {
        this.serverless.pluginManager.hooks['package:compileFunctions'].length = 0;
      }
      if (this.serverless.pluginManager.hooks['package:setupProviderConfiguration']) {
        this.serverless.pluginManager.hooks['package:setupProviderConfiguration'].length = 0;
      }
    }
  }

  getCfTemplate() {
    let templateFile = path.join(__dirname, './cfProvisionProductTemplate.json');
    if ('scProductTemplate' in this.serverless.service.provider
      && this.serverless.service.provider.scProductTemplate.length > 0) {
      templateFile = this.serverless.service.provider.scProductTemplate;
    }
    let templateJson;
    let parsedTemplate;
    try {
      templateJson = fs.readFileSync(templateFile);
    } catch (ex) {
      this.serverless.cli.log('error reading template file:: ', templateFile);
      process.exit(1);
    }
    try {
      parsedTemplate = JSON.parse(templateJson);
    } catch (ex) {
      this.serverless.cli.log('error parsing template file');
      process.exit(1);
    }
    return parsedTemplate;
  }

  compileFunctions() {
    const allFunctions = this.serverless.service.getAllFunctions();
    return BbPromise.each(
      allFunctions,
      functionName => this.compileFunction(functionName),
    );
  }

  compileFunction(functionName) {
    const newFunction = this.getCfTemplate();
    const setProvisioningParamValue = (key, value) => {
      const index = newFunction.Properties.ProvisioningParameters
        .findIndex(kv => kv.Key === key);
      if (index === -1) {
        this.serverless.cli.log(`object with Key=${key} not found in ProvisioningParameters!`);
        return;
      }
      newFunction.Properties.ProvisioningParameters[index].Value = value;
    };
    const functionObject = this.serverless.service.getFunction(functionName);
    functionObject.package = functionObject.package || {};

    const serviceArtifactFileName = this.provider.naming.getServiceArtifactName();
    const functionArtifactFileName = this.provider.naming.getFunctionArtifactName(functionName);

    let artifactFilePath = functionObject.package.artifact
      || this.serverless.service.package.artifact;
    if (!artifactFilePath
      || (this.serverless.service.artifact && !functionObject.package.artifact)) {
      let artifactFileName = serviceArtifactFileName;
      if (this.serverless.service.package.individually || functionObject.package.individually) {
        artifactFileName = functionArtifactFileName;
      }

      artifactFilePath = path.join(this.serverless.config.servicePath,
        '.serverless', artifactFileName);
    }
    if (this.serverless.service.provider.deploymentBucket) {
      setProvisioningParamValue('BucketName', this.serverless.service.provider.deploymentBucket);
    } else {
      const errorMessage = 'Missing provider.deploymentBucket parameter.'
        + ' Please make sure you provide a deployment bucket parameter. SC Provisioned Product cannot create an S3 Bucket.'
        + ' Please check the docs for more info';
      return BbPromise.reject(new this.serverless.classes.Error(errorMessage));
    }

    const s3Folder = this.serverless.service.package.artifactDirectoryName;
    const s3FileName = artifactFilePath.split(path.sep).pop();
    setProvisioningParamValue('BucketKey', `${s3Folder}/${s3FileName}`);

    if (!functionObject.handler) {
      const errorMessage = `Missing "handler" property in function "${functionName}".`
        + ' Please make sure you point to the correct lambda handler.'
        + ' For example: handler.hello.'
        + ' Please check the docs for more info';
      return BbPromise.reject(new this.serverless.classes.Error(errorMessage));
    }

    const MemorySize = Number(functionObject.memorySize)
      || Number(this.serverless.service.provider.memorySize)
      || 1024;
    const Timeout = Number(functionObject.timeout)
      || Number(this.serverless.service.provider.timeout)
      || 6;
    const Runtime = functionObject.runtime
      || this.serverless.service.provider.runtime
      || 'nodejs4.3';

    setProvisioningParamValue('FunctionHandler', functionObject.handler);
    setProvisioningParamValue('FunctionName', functionObject.name);
    setProvisioningParamValue('FunctionMemorySize', MemorySize);
    setProvisioningParamValue('FunctionTimeout', Timeout);
    setProvisioningParamValue('FunctionRuntime', Runtime);
    setProvisioningParamValue('FunctionStage', this.provider.getStage());
    const serviceProvider = this.serverless.service.provider;
    newFunction.Properties.ProvisioningArtifactName = serviceProvider.scProductVersion;
    newFunction.Properties.ProductId = serviceProvider.scProductId;
    newFunction.Properties.ProvisionedProductName = `provisionSC-${functionObject.name}`;

    // publish these properties to the platform
    this.serverless.service.functions[functionName].memory = MemorySize;
    this.serverless.service.functions[functionName].timeout = Timeout;
    this.serverless.service.functions[functionName].runtime = Runtime;

    if (functionObject.tags || this.serverless.service.provider.tags) {
      const tags = Object.assign(
        {},
        this.serverless.service.provider.tags,
        functionObject.tags,
      );
      newFunction.Properties.Tags = Object.keys(tags).map(key => (
        { Key: key, Value: tags[key] }));
    }

    const fileHash = crypto.createHash('sha256');
    fileHash.setEncoding('base64');

    return BbPromise.fromCallback((cb) => {
      const readStream = fs.createReadStream(artifactFilePath);
      readStream.on('data', (chunk) => {
        fileHash.write(chunk);
      })
        .on('end', cb)
        .on('error', cb);
    })
      .then(() => {
        // Finalize hashes
        fileHash.end();
        const fileDigest = fileHash.read();
        setProvisioningParamValue('LambdaVersionSHA256', fileDigest);
        // eslint-disable-next-line max-len
        const functionLogicalId = `${this.provider.naming.getLambdaLogicalId(functionName)}SCProvisionedProduct`;
        // eslint-disable-next-line max-len
        this.serverless.service.provider.compiledCloudFormationTemplate.Resources[functionLogicalId] = newFunction;
        // eslint-disable-next-line max-len
        this.serverless.service.provider.compiledCloudFormationTemplate.Outputs.ProvisionedProductID = {
          Description: 'Provisioned product ID',
          Value: { Ref: functionLogicalId },
        };
        return BbPromise.resolve();
      });
  }
}

module.exports = AwsCompileServiceCatalog;
