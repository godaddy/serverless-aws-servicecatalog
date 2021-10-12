/* eslint max-nested-callbacks: 0 */

/** @type{import('chalk').Chalk} */
// @ts-ignore
const chalk = require('chalk');

module.exports = {
  async displayEndpoints() {
    this.serverless.cli.consoleLog(chalk.yellow('endpoints:'));
    const allFunctions = this.serverless.service.getAllFunctions();

    for (const functionName of allFunctions) {
      await displayEndpoint.call(this, functionName);
    }

    return allFunctions;
  }
};

async function displayEndpoint(functionName) {
  const functionObject = this.serverless.service.getFunction(functionName);
  const deployedName = functionObject.name;

  const result = await this.provider.request('Lambda',
    'getFunction', {
      FunctionName: deployedName
    });
  const stack = await this.provider.request('CloudFormation',
    'describeStacks', {
      StackName: result.Tags['aws:cloudformation:stack-name']
    });
  const outputs = stack.Stacks[0].Outputs;
  const serviceEndpointOutputRegex = this.provider.naming
    .getServiceEndpointRegex();
  outputs.filter(x => x.OutputKey.match(serviceEndpointOutputRegex))
    .forEach((x) => {
      const endpoint = x.OutputValue;
      functionObject.events.forEach((event) => {
        if (event.http) {
          let method;
          let path;
          if (typeof event.http === 'object') {
            method = event.http.method.toUpperCase();
            path = event.http.path;
          } else {
            [method, path] = event.http.split(' ');
            method = method.toUpperCase();
          }
          this.serverless.cli.consoleLog(`  ${method} - ${endpoint}/${path}`);
        }
      });
    });
}
