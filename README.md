# serverless-aws-service-catalog
[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)

A plugin to allow the provisioning of AWS Service Catalog products with [serverless](http://www.serverless.com)


## Install

`npm install --save-dev serverless-aws-service-catalog`

Add the plugin to your `serverless.yml` file:

```yaml
plugins:
  localPath: './custom-serverless-plugins'
  modules:
    - serverless-aws-service-catalog
```

## Configuration
```yaml
provider:
  name: aws
  runtime: nodejs8.10
  deploymentBucket: S3-BUCKET
  scProductId: SERVICE-CATALOG-PRODUCT-ID
  scProductVersion: SERVICE-CATALOG-PRODUCT-VERSION
  # scProductTemplate: ./CUSTOM-TEMPLATE # optionally override the default template
  parameters:
    PortfolioProvider: "SERVICE-CATALOG-PORTFOLIO-PROVIDER"
    LaunchConstraintARN: arn:aws:iam::ID:role/LAUNCH-ROLE
    PortfolioId: PORTFOLIO-ID
    RepoRootURL: S3-BUCKET-URL
```


## Demo

### Prerequisites

 - Add the plugin to your project per the Install instructions above.

 - If using the AWS cli commands:
```shell
  export S3BUCKET=yourBucketName
  export SERVERLESS-USER=yourAwsServerlessUser
```

### 1. Copy the contents of the templates directory to a s3 bucket

```shell
aws s3 cp ./custom-serverless-plugins/serverless-aws-service-catalog/templates s3://$S3BUCKET  --exclude "*" --include "*.yml" --recursive 
```

### 2. Create the AWS Service Catalog portfolio (using admin user credentials)

  a. using the AWS cli:

  ```shell
  aws cloudformation create-stack --stack-name Serverless-SC-Portfolio-Stack --template-url "https://s3.amazonaws.com/$S3BUCKET/serverless/sc-portfolio-serverless.yml" --parameters ParameterKey=PorfolioName,ParameterValue=ServerlessPortfolio ParameterKey=RepoRootURL,ParameterValue="https://s3.amazonaws.com/$S3BUCKET/" ParameterKey=ServiceCatalogEndUsers,ParameterValue=$SERVICE_USER  --capabilities CAPABILITY_NAMED_IAM
  ```    
    (note: trailing / is required on the RepoRootUrl param)

  b. or in AWS Console:
  
  - In Cloud Formation, click "Create a new Stack"

  - Select "Specify an Amazon S3 template URL"

  - Enter the template location: https://s3.amazonaws.com/S3BUCKET/serverless/sc-portfolio-serverless.yml

  - Click Next

  - Enter the stack name: Serverless-SC-Portfolio-Stack

  - Enter RepoRootUrl param: https://s3.amazonaws.com/S3BUCKET/ ( NOTE: the trailing slash is required )

  - For ServiceCatalogEndUsers, enter a comma delimited list of users to add to the generated group

  - Click Next, Next and check the acknowledgement checkboxes

  - Click Create

### 3. Configure the serveless.yml in your lambda project

a. get the output params

  1. using the cli
```shell 
  aws cloudformation  describe-stacks --stack-name Serverless-SC-Portfolio-Stack
```
  2. or in the AWS Console

    - in CloudFormation, open the Serverless-SC-Portfolio-Stack stack
    - expand Outputs
b. under provider, enter the settings
  - enter a S3 bucket name to provider.deploymentBucket
  - copy serverlessProductId to scProductId
  - copy serverlessProvisioningArtifactNames to scProductVersion
  - enter the region
c. under provider.parameters, enter the settings
  - copy PortfolioProvider to PortfolioProvider
  - copy LaunchConstraintRoleARN to LaunchConstraintARN
  - copy PortfolioId to PortfolioId
  - enter the bucket with your templates for RepoRootUrl  

 ```yaml
provider:
  name: aws
  runtime: python2.7
  deploymentBucket: [deploymentbucket]
  scProductId: [serverlessProductId]
  scProductVersion: [serverlessProvisioningArtifactNames]
  region: [region]
  parameters:
    PortfolioProvider: [PortfolioProvider]
    LaunchConstraintARN: [LaunchConstraintRoleARN]
    PortfolioId: [PortfolioId]
    RepoRootURL: https://[templatebucket].s3.amazonaws.com/

 ```

### 4. Deploy (using serverless user credentials)

```shell
serverless deploy -v
```