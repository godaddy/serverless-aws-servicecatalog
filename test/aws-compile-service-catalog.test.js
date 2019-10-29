/* eslint no-sync: 0 */

const path = require('path');
const os = require('os');
const crypto = require('crypto');
const chai = require('chai');
const Serverless = require('serverless');
const AwsProvider = require('serverless/lib/plugins/aws/provider/awsProvider');
const AwsCompileServiceCatalog = require('../src/aws-compile-servicecatalog');

chai.use(require('chai-as-promised'));

const { expect } = chai;
const getTmpDirPath = () => path.join(os.tmpdir(),
  'tmpdirs-serverless', 'serverless', crypto.randomBytes(8).toString('hex'));
describe('AwsCompileFunctions', () => {
  let serverless;
  let testProvider;
  let awsCompileServiceCatalog;
  const functionNameHello = 'testHello';
  const functionNameBye = 'testBye';
  const productNameHello = 'TestHelloLambdaFunctionSCProvisionedProduct';
  const productNameBye = 'TestByeLambdaFunctionSCProvisionedProduct';
  const testEnvironment = {
    DEV: 'dev',
    TEST: 'test'
  };
  const testVpc = {
    securityGroupIds: ['group1', 'group2'],
    subnetIds: ['subnet1', 'subnet2']
  };

  // eslint-disable-next-line max-statements
  const setup = (providerProps) => {
    const options = { stage: 'dev', region: 'us-east-1' };
    const serviceArtifact = 'new-service.zip';
    const individualArtifact = 'test.zip';

    testProvider = {
      deploymentBucket: 'test-bucket',
      scProdcutVersion: 'v1.0',
      scProductId: 'prod-testid'
    };
    if (providerProps) {
      testProvider = { ...testProvider, ...providerProps };
    }
    serverless = new Serverless(options);
    serverless.service.provider = { ...serverless.service.provider, ...testProvider };
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    serverless.cli = new serverless.classes.CLI();
    awsCompileServiceCatalog = new AwsCompileServiceCatalog(serverless, options);
    awsCompileServiceCatalog.serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {}
    };
    awsCompileServiceCatalog.packagePath = getTmpDirPath();
    // The contents of the test artifacts need to be predictable so the hashes stay the same
    serverless.utils.writeFileSync(path.join(awsCompileServiceCatalog.packagePath,
      serviceArtifact), 'foobar');
    serverless.utils.writeFileSync(path.join(awsCompileServiceCatalog.packagePath,
      individualArtifact), 'barbaz');
    awsCompileServiceCatalog.serverless.service.service = 'new-service';
    awsCompileServiceCatalog.serverless.service.package.artifactDirectoryName = 'somedir';
    awsCompileServiceCatalog.serverless.service.package
      .artifact = path.join(awsCompileServiceCatalog.packagePath, serviceArtifact);
    awsCompileServiceCatalog.serverless.service.functions = {};
    awsCompileServiceCatalog.serverless.service.functions[functionNameHello] = {
      name: 'test-hello',
      package: {
        artifact: path.join(awsCompileServiceCatalog.packagePath,
          individualArtifact)
      },
      handler: 'handler.hello',
      environment: testEnvironment,
      vpc: testVpc
    };
    awsCompileServiceCatalog.serverless.service.functions[functionNameBye] = {
      name: 'test-bye',
      package: {
        artifact: path.join(awsCompileServiceCatalog.packagePath,
          individualArtifact)
      },
      handler: 'handler.bye'
    };
  };
  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () => {
      setup();
      expect(awsCompileServiceCatalog.provider).to.be.instanceof(AwsProvider);
    });
  });
  describe('#compileFunctions()', () => {
    it('should set the functionResource properties', () => {
      setup();
      return expect(awsCompileServiceCatalog.compileFunctions()).to.be.fulfilled
        .then(() => {
          const functionResource = awsCompileServiceCatalog.serverless.service.provider
            .compiledCloudFormationTemplate.Resources[productNameHello];
          expect(functionResource.Type).to.equal('AWS::ServiceCatalog::CloudFormationProvisionedProduct');
          expect(functionResource.Properties.ProductId).to.equal(testProvider.scProductId);
          expect(functionResource.Properties.ProvisionedProductName).to.equal('provisionSC-test-hello');
        });
    });
    it('should pass the environment parameters as json', () => {
      setup();
      return expect(awsCompileServiceCatalog.compileFunctions()).to.be.fulfilled
        .then(() => {
          const functionResource = awsCompileServiceCatalog.serverless.service.provider
            .compiledCloudFormationTemplate.Resources[productNameHello];
          const envParams = functionResource.Properties.ProvisioningParameters.find(k => k.Key === 'EnvironmentVariablesJson');
          expect(envParams.Value).to.equal(JSON.stringify(testEnvironment));
        });
    });
    it('should reject invalid environment keys', () => {
      setup();
      awsCompileServiceCatalog.serverless.service.functions[functionNameHello].environment = {
        'OK': 'value1',
        'FOO$@~': 'value2'
      };
      expect(awsCompileServiceCatalog.compileFunctions()).to.be.rejectedWith('Invalid characters in environment variable FOO$@~');
    });
    it('should set the vpc parameters', () => {
      setup();
      return expect(awsCompileServiceCatalog.compileFunctions()).to.be.fulfilled
        .then(() => {
          const functionResource = awsCompileServiceCatalog.serverless.service.provider
            .compiledCloudFormationTemplate.Resources[productNameHello];
          const securityParam = functionResource.Properties.ProvisioningParameters.find(k => k.Key === 'VpcSecurityGroups');
          expect(securityParam.Value).to.equal(testVpc.securityGroupIds.toString());
          const subnetParam = functionResource.Properties.ProvisioningParameters.find(k => k.Key === 'VpcSubnetIds');
          expect(subnetParam.Value).to.equal(testVpc.subnetIds.toString());
        });
    });
    it('should reject invalid environment key values', () => {
      setup();
      awsCompileServiceCatalog.serverless.service.functions[functionNameHello].environment = {
        OK: 'value1',
        OK_CFRef: ['Ref'],
        OK_FN: ['Fn::GetAtt'],
        NOT_OK: ['foo']
      };
      expect(awsCompileServiceCatalog.compileFunctions()).to.be.rejectedWith('Environment variable NOT_OK must contain string');
    });
    it('should override the template when the template', () => {
      const providerProps = {
        scProductTemplate: path.join(__dirname, './testTemplate.json')
      };
      const customParam = {
        Key: 'CustomParam',
        Value: 'CustomValue'
      };
      setup(providerProps);
      return expect(awsCompileServiceCatalog.compileFunctions()).to.be.fulfilled
        .then(() => {
          const functionResource = awsCompileServiceCatalog.serverless.service.provider
            .compiledCloudFormationTemplate.Resources[productNameHello];
          expect(functionResource.Type).to.equal('AWS::ServiceCatalog::CloudFormationProvisionedProduct');
          const param = functionResource.Properties.ProvisioningParameters.find(k => k.Key === 'CustomParam');
          expect(param).to.deep.equal(customParam);
        });
    });
    it('should set the handle multiple handlers', () => {
      setup();
      return expect(awsCompileServiceCatalog.compileFunctions()).to.be.fulfilled
        .then(() => {
          let functionResource = awsCompileServiceCatalog.serverless.service.provider
            .compiledCloudFormationTemplate.Resources[productNameHello];
          expect(functionResource.Properties.ProvisionedProductName).to.equal('provisionSC-test-hello');
          functionResource = awsCompileServiceCatalog.serverless.service.provider
            .compiledCloudFormationTemplate.Resources[productNameBye];
          expect(functionResource.Properties.ProvisionedProductName).to.equal('provisionSC-test-bye');
        });
    });
    it('should set Layers when specified', () => {
      setup();
      awsCompileServiceCatalog.serverless.service.functions[functionNameHello]
        .layers = ['arn:aws:xxx:*:*'];
      return expect(awsCompileServiceCatalog.compileFunctions()).to.be.fulfilled
        .then(() => {
          const functionResource = awsCompileServiceCatalog.serverless.service.provider
            .compiledCloudFormationTemplate.Resources[productNameHello];
          const securityParam = functionResource.Properties.ProvisioningParameters.find(k => k.Key === 'LambdaLayers');
          expect(securityParam.Value).to.equal('arn:aws:xxx:*:*');
        });
    });
  });
});
