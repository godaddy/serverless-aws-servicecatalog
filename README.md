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
    RepoRootURL: S3-BUCKET-OR-REPO-URL
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
  aws cloudformation create-stack --stack-name Serverless-SC-Portfolio-Stack --template-url "https://s3.amazonaws.com/$S3BUCKET/serverless/sc-portfolio-serverless.yml" --parameters ParameterKey=PorfolioName,ParameterValue=ServerlessPortfolio ParameterKey=RepoRootURL,ParameterValue="https://s3.amazonaws.com/$S3BUCKET/" --capabilities CAPABILITY_NAMED_IAM
  ```    
    (note: trailing / is required on the RepoRootUrl param)

  b. or in AWS Console:
  
  - In Cloud Formation, click "Create a new Stack"

  - Select "Specify an Amazon S3 template URL"

  - Enter the template location: https://s3.amazonaws.com/S3BUCKET/serverless/sc-portfolio-serverless.yml

  - Click Next

  - Enter the stack name: Serverless-SC-Portfolio-Stack

  - Enter RepoRootUrl param: https://s3.amazonaws.com/S3BUCKET/ ( NOTE: the trailing slash is required )

  - Click Next, Next and check the acknowledgement checkboxes

  - Click Create

### 3. Set Permissions (using admin user credentials)
  a. using the AWS cli

  ```shell
      aws iam add-user-to-group --group-name ServiceCatalogEndUsers --user-name $SERVERLESS-USER
  ``` 
  
  b. or in the AWS console
   - in IAM, click on the serverless user
   - click Groups
   - click Add user to group
   - select the ServiceCatalogEndUsers group and click "Add to Group"

### 4. Configure the serveless.yml in your lambda project

a. update the portfolio info
```shell 
  aws servicecatalog list-portfolios 
```
  - copy the Id value to PortfolioId
  - copy ProviderName to PortfolioProvider

 b. update the launch contraint
```shell
aws servicecatalog list-constraints-for-portfolio  --portfolio-id PORTFOLIO_ID  
```
  - copy the Description value to LaunchConstraintARN

c. update the productId
```
aws servicecatalog search-products
``` 
  - copy the ProductId value to scProductId

### 5. Deploy (using serverless user credentials)

```shell
serverless deploy
```