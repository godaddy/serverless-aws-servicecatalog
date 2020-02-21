# serverless-aws-service-catalog
[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)

A plugin to allow the provisioning of [AWS Service Catalog](https://console.aws.amazon.com/servicecatalog) products with [serverless](http://www.serverless.com)


## Install

`npm install --save-dev serverless-aws-servicecatalog`

Alternatively you may package the plugin `npm pack` and install it with npm from the tarball.

Add the plugin to your `serverless.yml` file:

```yaml
plugins:  
  - serverless-aws-servicecatalog
```

## Sample Configuration
```yaml
provider:
  name: aws
  runtime: python2.7
  deploymentBucket: serverless-src-1234567890
  scProductId: prod-hpzfzam5x5vac
  scProductVersion: v1.2
  region: us-east-1
  stage: dev  
  tags:
    product: 'my api'
  provisioningParameters:
    EndpointType: REGIONAL
```  


## Example
There are 2 ways to setup the example, using the launch-stack button or manually from your own S3 bucket.  Both methods result in a 
AWS CloudFormation stack with outputs that will be used as parameters in the `serverless.yml` config.


### Express Setup using launch-stack
1. Click the button below to setup your account.  
    [![CreateStack](https://s3.amazonaws.com/cloudformation-examples/cloudformation-launch-stack.png)](https://console.aws.amazon.com/cloudformation/#/stacks/new?stackName=Serverless-SC-Portfolio-Stack&templateURL=https://s3.amazonaws.com/aws-service-catalog-reference-architectures/serverless/sc-portfolio-serverless.yml)  
    https://s3.amazonaws.com/aws-service-catalog-reference-architectures/serverless/sc-portfolio-serverless.yml

2. Allow end users to deploy:  
    
    - If you are using IAM users for deployment then go to the __ServiceCatalogEndUsers__ parameter, enter a comma delimited list of users to add to the generated group.  

    - If you are using role based authentication then supply up to 2 role names in the __LinkedRole1__ and __LinkedRole2__ parameters.

3. Click Next, Next and check the acknowledgement checkboxes in the blue Capabilities box at the bottom

4. Click Create. Then wait for the stack to complete and go to the "Configure the serveless.yml in your lambda project" section below.



### Manually Setup using your own S3 bucket
1. Copy the files from the templates directory to your S3 bucket

```shell
aws s3 cp ./custom-serverless-plugins/serverless-aws-service-catalog/templates s3://$S3BUCKET  --exclude "*" --include "*.yml" --recursive 
```

2. Create the Cloudformation stack from the portfolio template.  To allow end users to deploy you will need to edit the params of the CloudFormation template:  
    
    - If you are using IAM users for deployment then go to the ServiceCatalogEndUsers parameter, enter a comma delimited list of users to add to the generated group.  
    For this example an IAM user is supplied using the `SERVERLESS_USER` variable

    - If you are using role based authentication then supply up to 2 role names in the LinkedRole1 and LinkedRole2 parameters.
 
```shell
export S3BUCKET=yourBucketName
export SERVERLESS_USER=yourAwsServerlessUser
aws cloudformation create-stack --stack-name Serverless-SC-Portfolio-Stack --template-url "https://s3.amazonaws.com/$S3BUCKET/serverless/sc-portfolio-serverless.yml" --parameters ParameterKey=PorfolioName,ParameterValue=ServerlessPortfolio ParameterKey=RepoRootURL,ParameterValue="https://s3.amazonaws.com/$S3BUCKET/" ParameterKey=ServiceCatalogEndUsers,ParameterValue=$SERVERLESS_USER  --capabilities CAPABILITY_NAMED_IAM
```    
(note: trailing / is required on the RepoRootUrl param)



### Configure your Serverless Framework project
Regardless of how you deployed the CloudFormation above, you now need to copy the output values from CloudFormation to your `serverless.yml` file.
This is only covering the AWS provider section and assumes you have a complete config for serverless.  See the [Serverless Framework examples](https://github.com/serverless/examples) for more details.

1. get the output params  
    a. using the cli
    ```shell 
    aws cloudformation  describe-stacks --stack-name Serverless-SC-Portfolio-Stack
    ```  

    b. or in the [AWS CloudFormation Console](https://console.aws.amazon.com/cloudformation)
    - in CloudFormation, open the Serverless-SC-Portfolio-Stack stack
    - expand Outputs
    
2. under provider, enter the settings
    - copy ServerlessDeploymentBucket to deploymentBucket
    - copy serverlessProductId to scProductId
    - copy serverlessProvisioningArtifactNames to scProductVersion
    - enter the region, stage, runtime, and any tags as you normally would.


 ```yaml
provider:
  name: aws
  runtime: python2.7
  stage: dev
  deploymentBucket: [deploymentbucket]
  scProductId: [serverlessProductId] # Or use scProductName instead if you want to target your template's name
  scProductVersion: [serverlessProvisioningArtifactNames]
  region: us-east-1
  tags:
    product: 'my api'
 ```

### Deploy 
If you have modified the configuration and have your AWS credentials setup according to 
[serverless instrcutions](https://serverless.com/framework/docs/providers/aws/guide/credentials/), you can now deploy as you normally would.

```shell
serverless deploy -v
```

## Building a Custom Serverless Service Catalog Product

### Custom parameters passed by the plugin

The plugin passes custom parameters for the following Serverless features: (see sc-serverless-lambda.yml)

- **Vpc**: supports the standard Serverless vpc configuration in serverless.yml
```yaml
# serverless.yml
vpc:
 securityGroupIds:
   - "sg-XXXXXXXX"
  subnetIds:
   - "subnet-XXXXXXX"
```

```yaml
# service catalog product yml
VpcSecurityGroups:
  Type: CommaDelimitedList
  Description: (optional) The list of security group ids of the VPC that needs to be accessed.
    Default: ""
VpcSubnetIds:
  Type: CommaDelimitedList
  Description: (optional) The list of subnet Ids within the VPC that needs access to.
  Default: ""  
```
- **Layers**: supports a list of existing layers

```yaml
# serverless.yml
layers:
   - arn:aws:lambda:us-east-1:XXXXXXXXXX:layer:node_js_layer:1
```

```yaml
# service catalog product yml
LambdaLayers:
  Type: CommaDelimitedList
  Description: "(optional) list of lambda layers for the function"
  Default: ""
```

## Using Custom Service Catalog Parameter Names

If you already have a service catalog product for Lambdas that has a different naming schema, you can still use that product. You can provide a renaming mapping in your `serverless.yml` file like so:

```yaml
provider:
  scParameterMapping:
    stage: SomeCustomStageName
    name: MyLambdaParameterName
```

You can specify any of the following properties to be renamed (shown here with their default values):

```yaml
provider:
  scParameterMapping:
    s3Bucket: S3Bucket
    s3Key: S3Key
    handler: Handler
    name: LambdaName
    memorySize: MemorySize
    timeout: Timeout
    runtime: Runtime
    stage: LambdaStage
    environmentVariablesJson: EnvironmentVariablesJson
    vpcSecurityGroups: VpcSecurityGroups
    vpcSubnetIds: VpcSubnetIds
    lambdaLayers: LambdaLayers
```
