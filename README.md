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