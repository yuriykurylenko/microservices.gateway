var restify = require('restify');
var request = require('superagent');
var _ = require('lodash');

var services = {
  users: {
    domain: 'localhost:9292',
    endpoints: [{
      method: 'get',
      path: ''
    }, {
      method: 'post',
      path: '/login'
    }]
  },
  tasks: {
    domain: 'localhost:8000',
    endpoints: [{
      method: 'get',
      path: ''
    }]
  }
};

var server = restify.createServer();
server.use(restify.bodyParser({ mapParams: true }));

function registerEndpoint(serviceName, domain, endpoint) {
  return function(req, res, next) {
    var chain = request[endpoint.method](domain + '/' + serviceName + endpoint.path);
    if (_.includes(['post', 'put', 'patch'], endpoint.method) && req.body) {
      chain = chain.send(JSON.parse(req.body));
    }
    chain.end(function(error, result) {
      if (error) {
        res.send(error.status);
      } else if (result) {
        var json = JSON.parse(result.text);
        res.send(result.status, json);
      }
    });
  };
};

function registerServices() {
  _.each(_.keys(services), function(key) {
    var service = services[key];
    _.each(service.endpoints, function(endpoint) {
      server[endpoint.method](key + endpoint.path, registerEndpoint(key, service.domain, endpoint));
    });
  });
}

registerServices();

server.listen(8080, function() {
  console.log('%s listening at %s', server.name, server.url);
});
