/* eslint no-process-exit: 0 */

const path = require('path');
const fs = require('fs');
const { displayEndpoints } = require('./display-endpoints');

const scParameterMappingDefaults = {
  s3Bucket: 'S3Bucket',
  s3Key: 'S3Key',
  handler: 'Handler',
  name: 'LambdaName',
  memorySize: 'MemorySize',
  timeout: 'Timeout',
  runtime: 'Runtime',
  stage: 'LambdaStage',
  environmentVariablesJson: 'EnvironmentVariablesJson',
  vpcSecurityGroups: 'VpcSecurityGroups',
  vpcSubnetIds: 'VpcSubnetIds',
  lambdaLayers: 'LambdaLayers'
};

/**
 * @typedef {import('serverless')} Serverless
 * @typedef {import('serverless').Options} ServerlessOptions
 */

class AwsCompileServiceCatalog {
  /**
   * Construct an instance of the serverless-aws-servicecatalog plugin
   *
   * @param {Serverless} serverless Serverless instance
   * @param {ServerlessOptions} options Options
   */
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    const servicePath = this.serverless.config.servicePath || '';
    this.packagePath = this.serverless.service.package.path
      || path.join(servicePath || '.', '.serverless');
    this.provider = this.serverless.getProvider('aws');

    // Add custom schema properties to the AWS provider. For reference use https://github.com/ajv-validator/ajv
    if (serverless.configSchemaHandler) {
      serverless.configSchemaHandler.defineProvider('aws', {
        provider: {
          properties: {
            scProductId: { type: 'string' },
            scProductName: { type: 'string' },
            scProductVersion: { type: 'string' },
            scProductTemplate: { type: 'string' },
            scParameterMapping: { type: 'object' },
            provisioningParameters: { type: 'object' }
          }
        }
      });
      serverless.configSchemaHandler.defineFunctionProperties('aws', {
        properties: {
          provisioningParameters: { type: 'object' }
        }
      });
    }

    // key off the ServiceCatalog Product ID or name
    if ('scProductId' in this.serverless.service.provider ||
      'scProductName' in this.serverless.service.provider) {
      this.hooks = {
        'before:package:finalize': this.compileFunctions.bind(this),
        'after:aws:info:displayApiKeys': displayEndpoints.bind(this)
      };
      this.serverless.cli.log('AwsCompileServiceCatalog');
      this.clearOtherPlugins();
    }

    const mappingOverrides = this.serverless.service.provider &&
      this.serverless.service.provider.scParameterMapping || {};
    this.parameterMapping = Object.assign(
      {},
      scParameterMappingDefaults,
      mappingOverrides
    );
  }

  clearOtherPlugins() {
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
    if (this.serverless.pluginManager.hooks['aws:info:displayEndpoints']) {
      this.serverless.pluginManager.hooks['aws:info:displayEndpoints'].length = 0;
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
      // eslint-disable-next-line no-sync
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

  async compileFunctions() {
    const allFunctions = this.serverless.service.getAllFunctions();
    for (const functionName of allFunctions) {
      await this.compileFunction(functionName);
    }

    return allFunctions;
  }

  getParameterName(name) {
    return this.parameterMapping[name];
  }

  // eslint-disable-next-line complexity, max-statements
  compileFunction(functionName) {
    const newFunction = this.getCfTemplate();
    const setProvisioningParamValue = (key, value) => {
      if (!key) {
        return;
      }

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
      || (this.serverless.service.package.artifact && !functionObject.package.artifact)) {
      let artifactFileName = serviceArtifactFileName;
      if (this.serverless.service.package.individually || functionObject.package.individually) {
        artifactFileName = functionArtifactFileName;
      }

      artifactFilePath = path.join(this.serverless.config.servicePath,
        '.serverless', artifactFileName);
    }
    if (this.serverless.service.provider.deploymentBucket) {
      setProvisioningParamValue(this.getParameterName('s3Bucket'), this.serverless.service.provider.deploymentBucket);
    } else {
      const errorMessage = 'Missing provider.deploymentBucket parameter.'
        + ' Please make sure you provide a deployment bucket parameter. SC Provisioned Product cannot create an S3 Bucket.'
        + ' Please check the docs for more info';
      throw new this.serverless.classes.Error(errorMessage);
    }

    const s3Folder = this.serverless.service.package.artifactDirectoryName;
    const s3FileName = artifactFilePath.split(path.sep).pop();
    setProvisioningParamValue(this.getParameterName('s3Key'), `${s3Folder}/${s3FileName}`);

    if (!functionObject.handler && !functionObject.image) {
      const errorMessage = `Missing "handler" or "image" property in function "${functionName}".`
        + ' Please make sure you point to the correct lambda handler.'
        + ' For example: handler.hello.'
        + ' Please check the docs for more info';
      throw new this.serverless.classes.Error(errorMessage);
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

    if (functionObject.handler) {
      setProvisioningParamValue(this.getParameterName('handler'), functionObject.handler);
    } else {
      setProvisioningParamValue(this.getParameterName('image'), functionObject.image);
    }
    setProvisioningParamValue(this.getParameterName('name'), functionObject.name);
    setProvisioningParamValue(this.getParameterName('memorySize'), MemorySize);
    setProvisioningParamValue(this.getParameterName('timeout'), Timeout);
    setProvisioningParamValue(this.getParameterName('runtime'), Runtime);
    setProvisioningParamValue(this.getParameterName('stage'), this.provider.getStage());
    const serviceProvider = this.serverless.service.provider;
    newFunction.Properties.ProvisioningArtifactName = serviceProvider.scProductVersion;

    if (serviceProvider.scProductId) {
      newFunction.Properties.ProductId = serviceProvider.scProductId;
    } else if (serviceProvider.scProductName) {
      delete newFunction.Properties.ProductId;
      newFunction.Properties.ProductName = serviceProvider.scProductName;
    } else {
      const errorMessage = 'Missing scProductId or scProductName on service.'
        + ' Please make sure to define one of "scProductId" or "scProductName".'
        + ' See documentation for more info.';
      throw new this.serverless.classes.Error(errorMessage);
    }

    newFunction.Properties.ProvisionedProductName = `provisionSC-${functionObject.name}`;

    // publish these properties to the platform
    this.serverless.service.functions[functionName].memory = MemorySize;
    this.serverless.service.functions[functionName].timeout = Timeout;
    this.serverless.service.functions[functionName].runtime = Runtime;

    if (functionObject.tags || this.serverless.service.provider.tags) {
      const tags = Object.assign(
        {},
        this.serverless.service.provider.tags,
        functionObject.tags
      );
      newFunction.Properties.Tags = Object.keys(tags).map(key => (
        { Key: key, Value: tags[key] }));
    }

    if (functionObject.environment || this.serverless.service.provider.environment) {
      const environment = Object.assign(
        {},
        this.serverless.service.provider.environment || {},
        functionObject.environment || {}
      );
      const envKeys = Object.keys(environment);
      envKeys.forEach((key) => {
        // taken from the bash man pages
        if (!key.match(/^[A-Za-z_][a-zA-Z0-9_]*$/)) {
          throw new this.serverless.classes.Error(`Invalid characters in environment variable name ${key}`);
        }
        const value = environment[key];
        if (value === Object(value)) {
          const isCFRef = !value.some(v => v !== 'Ref' && !v.startsWith('Fn::'));
          if (!isCFRef) {
            throw new this.serverless.classes.Error(`Environment variable ${key} must contain string`);
          }
        }
        return true;
      });
      newFunction.Properties.ProvisioningParameters.push({
        Key: this.getParameterName('environmentVariablesJson'),
        Value: JSON.stringify(environment)
      });
    }
    if (functionObject.provisioningParameters
        || this.serverless.service.provider.provisioningParameters) {
      const provisioningParameters = Object.assign(
        {},
        this.serverless.service.provider.provisioningParameters,
        functionObject.provisioningParameters
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
          Value: value
        });
        return false;
      })) {
        throw new this.serverless.classes.Error(errorMessage);
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
          Key: this.getParameterName('vpcSecurityGroups'),
          Value: vpcSecurityGroups.toString()
        });
        newFunction.Properties.ProvisioningParameters.push({
          Key: this.getParameterName('vpcSubnetIds'),
          Value: vpcSubnetIds.toString()
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
        Key: this.getParameterName('lambdaLayers'),
        Value: layers
      });
    }

    // Only leave the provisioning parameters that exist and have a key
    newFunction.Properties.ProvisioningParameters = newFunction.Properties.ProvisioningParameters
      .filter(item => item && item.Key);

    const functionLogicalId = `${this.provider.naming.getLambdaLogicalId(functionName)}SCProvisionedProduct`;
    this.serverless.service.provider.compiledCloudFormationTemplate
      .Resources[functionLogicalId] = newFunction;
    this.serverless.service.provider
      .compiledCloudFormationTemplate.Outputs.ProvisionedProductID = {
        Description: 'Provisioned product ID',
        Value: { Ref: functionLogicalId }
      };
  }
}

module.exports = AwsCompileServiceCatalog;
