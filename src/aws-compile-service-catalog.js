'use strict';

const BbPromise = require('bluebird');
const path = require('path');
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
    let templateFile = path.join(__dirname, './cf-provision-product-template.json');
    if ('scProductTemplate' in this.serverless.service.provider
      && this.serverless.service.provider.scProductTemplate.length > 0) {
      templateFile = this.serverless.service.provider.scProductTemplate;
    }
    let templateJson;
    let parsedTemplate;
    try {
      templateJson = fs.readFileSync(templateFile, 'utf8');
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
      setProvisioningParamValue('S3Bucket', this.serverless.service.provider.deploymentBucket);
    } else {
      const errorMessage = 'Missing provider.deploymentBucket parameter.'
        + ' Please make sure you provide a deployment bucket parameter. SC Provisioned Product cannot create an S3 Bucket.'
        + ' Please check the docs for more info';
      return BbPromise.reject(new this.serverless.classes.Error(errorMessage));
    }

    const s3Folder = this.serverless.service.package.artifactDirectoryName;
    const s3FileName = artifactFilePath.split(path.sep).pop();
    setProvisioningParamValue('S3Key', `${s3Folder}/${s3FileName}`);

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

    setProvisioningParamValue('Handler', functionObject.handler);
    setProvisioningParamValue('LambdaName', functionObject.name);
    setProvisioningParamValue('MemorySize', MemorySize);
    setProvisioningParamValue('Timeout', Timeout);
    setProvisioningParamValue('Runtime', Runtime);
    setProvisioningParamValue('LambdaStage', this.provider.getStage());
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

    if (functionObject.environment || this.serverless.service.provider.environment) {
      const environment = Object.assign(
        {},
        this.serverless.service.provider.environment || {},
        functionObject.environment || {},
      );
      const envKeys = Object.keys(environment);
      envKeys.forEach((key) => {
        // taken from the bash man pages
        if (!key.match(/^[A-Za-z_][a-zA-Z0-9_]*$/)) {
          return BbPromise.reject(new this.serverless.classes.Error(`Invalid characters in environment variable name ${key}`));
        }
        const value = environment[key];
        if (value === Object(value)) {
          const isCFRef = !value.some(v => v !== 'Ref' && !v.startsWith('Fn::'));
          if (!isCFRef) {
            return BbPromise.reject(new this.serverless.classes.Error(`Environment variable ${key} must contain string`));
          }
        }
        return true;
      });
      newFunction.Properties.ProvisioningParameters.push({
        Key: 'EnvironmentVariablesJson',
        Value: JSON.stringify(environment),
      });
    }
    if (functionObject.provisioningParameters
        || this.serverless.service.provider.provisioningParameters) {
      const provisioningParameters = Object.assign(
        {},
        this.serverless.service.provider.provisioningParameters,
        functionObject.provisioningParameters,
      );
      let errorMessage = null;
      if (Object.entries(provisioningParameters).some(([key, value]) => {
        if (newFunction.Properties.ProvisioningParameters.some(p => p.Key === key)) {
          errorMessage = `Duplicate provisioning parameter "${key}" found.`
            + ' Please make sure that all items listed in "provisioningParameters" are unique.';
          return true;
        }

        newFunction.Properties.ProvisioningParameters.push({
          Key: key,
          Value: value,
        });
        return false;
      })) {
        return BbPromise.reject(this.serverless.classes.Error(errorMessage));
      }
    }
    if (!functionObject.vpc) {
      functionObject.vpc = {};
    } else {
      const vpcSecurityGroups = functionObject.vpc.securityGroupIds
        || this.serverless.service.provider.vpc.securityGroupIds;

      const vpcSubnetIds = functionObject.vpc.subnetIds
        || this.serverless.service.provider.vpc.subnetIds;

      if (vpcSecurityGroups && vpcSubnetIds) {
        newFunction.Properties.ProvisioningParameters.push({
          Key: 'VpcSecurityGroups',
          Value: vpcSecurityGroups.toString(),
        });
        newFunction.Properties.ProvisioningParameters.push({
          Key: 'VpcSubnetIds',
          Value: vpcSubnetIds.toString(),
        });
      }
    }

    let { layers } = functionObject;
    if (!layers || !Array.isArray(layers)) {
      ({ layers } = this.serverless.service.provider);
      if (!layers || !Array.isArray(layers)) {
        layers = null;
      }
    }
    layers = layers && layers.toString();
    if (layers) {
      newFunction.Properties.ProvisioningParameters.push({
        Key: 'LambdaLayers',
        Value: layers,
      });
    }

    const functionLogicalId = `${this.provider.naming.getLambdaLogicalId(functionName)}SCProvisionedProduct`;
    this.serverless.service.provider.compiledCloudFormationTemplate
      .Resources[functionLogicalId] = newFunction;
    this.serverless.service.provider
      .compiledCloudFormationTemplate.Outputs.ProvisionedProductID = {
        Description: 'Provisioned product ID',
        Value: { Ref: functionLogicalId },
      };
    return BbPromise.resolve();
  }
}

module.exports = AwsCompileServiceCatalog;
