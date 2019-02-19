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
## Setup
( note: Replace S3BUCKET with your bucket name for the following steps )

### 1. Copy the contents of the templates directory to a s3 bucket

```shell
aws s3 cp ./custom-serverless-plugins/serverless-aws-service-catalog/templates s3://S3BUCKET  --exclude "*" --include "*.yml" --recursive 
```

### 2. Create the AWS Service Catalog portfolio

  - Login to the AWS console as a user with permissions to create Service Catalog products.

  - In Cloud Formation, click "Create a new Stack"

  - Select "Specify an Amazon S3 template URL"

  - Enter the template location: https://s3.amazonaws.com/S3BUCKET/serverless/sc-portfolio-serverless.yml

  - Click Next

  - Enter the stack name: Serverless-SC-Portfolio-Stack

  - Enter RepoRootUrl param: https://s3.amazonaws.com/S3BUCKET/ ( NOTE: the trailing slash is required )

  - Click Next, Next and check the acknowledgement checkboxes

  - Click Create

### 3 Set Permissions
  - In the AWS console Add the user that the aws cli is running under to the ServiceCatalogEndUsers IAM group

### 4. Configure the serveless.yml in your lambda project

### Configuration reference
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

```shell 
  aws servicecatalog list-portfolios 
```
  - copy the Id value to PortfolioId
  - copy ProviderName to PortfolioProvider

```shell
aws servicecatalog list-constraints-for-portfolio  --portfolio-id PORTFOLIO_ID  
```
  - copy the Description value to LaunchConstraintARN

```
aws servicecatalog search-products
``` 
  - copy the ProductId value to scProductId

