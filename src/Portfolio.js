'use strict';

const path = require('path');
const fs = require('fs');
const AWS = require('aws-sdk');

const uploadTemplates = (serverless, options) => {

  const s3Client = serverless => {
    AWS.config.update({
      region: 'us-east-1'
    });
    return new AWS.S3();
  }
  console.log('***in uploadTemplates');
 
  const bucket = serverless.service.provider.parameters.RepoRootURL;
  console.log('***bucket', bucket);
  const folderPath = path.join(__dirname, '../templates');
  console.log('folderPath=', folderPath);
  const dirs = fs.readdirSync(folderPath);
  if (!dirs || dirs.length === 0) {
    console.log(`folder '${folderPath}' is empty or does not exist.`);
    return;
  }
  console.log('**files=', dirs);
  // for each file in the directory
  dirs.map((dirName) => {
    console.log('dirName=', dirName);
    // get the full path of the file
    const dirPath = path.join(folderPath, dirName);

    // ignore if directory
    if (fs.lstatSync(dirPath).isDirectory() && !dirPath.startsWith('.')) {
      const templates = fs.readdirSync(dirPath);
      templates.map((template) => {
        console.log('template=', template);
        const fileContent = fs.readFileSync(path.join(dirPath, template));
        // if unable to read file contents, throw exception
        
        const key = `${dirName}/${template}`;
        console.log('key=', key);
        console.log('bucket=', bucket);
        console.log('fileContent=', fileContent)
        // const base64data = Buffer.from(fileContent);
        // upload file to S3
        var s3 = s3Client(serverless);
        console.log('s3=', s3)
        s3.listBuckets({}, function(err, data) {
          if (err) {
            serverless.cli.log("Error" + err);
          } else {
            serverless.cli.log("Success" +  data.Buckets);
          }
        });


        // s3.putObject({
        //   Bucket: bucket,
        //   Key: 'x' + key,
        //   Body: fileContent,
        // }, (err, res) => {
        //   if (err) console.log('error', err);
        //   if (res) console.log('res', res);
        //   console.log(`Successfully uploaded '${dirName}'!`);
        // });
      });
    }
  });
};
const createPortfolio = (serverless, options) => {
  console.log('***in createPortfolio');
};
module.exports = {
  createPortfolio,
  uploadTemplates,
};
