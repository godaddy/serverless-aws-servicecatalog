const chalk = require('chalk');
const BbPromise = require('bluebird');

module.exports = {
  displayEndpoints() {
    this.serverless.cli.consoleLog(chalk.yellow('endpoints:'));
    const allFunctions = this.serverless.service.getAllFunctions();
    return BbPromise.each(
      allFunctions,
      (functionName) => {
        const functionObject = this.serverless.service.getFunction(functionName);
        const deployedName = functionObject.name;
        return this.provider.request('Lambda',
          'getFunction',
          { FunctionName: deployedName })
          .then(result => this.provider.request('CloudFormation',
            'describeStacks',
            { StackName: result.Tags['aws:cloudformation:stack-name'] })
            .then((stack) => {
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
                  BbPromise.resolve();
                });
            }));
      },
    );
  },
};
