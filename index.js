var restify = require('restify');
var request = require('superagent');
var jwt = require('jsonwebtoken');
var _ = require('lodash');

var services = {
  users: {
    domain: 'localhost:9292',
    endpoints: [{
      method: 'get',
      path: '',
      roles: ['admin']
    }]
  },
  tasks: {
    domain: 'localhost:8000',
    endpoints: [{
      method: 'get',
      path: '',
      roles: ['user', 'admin']
    }]
  }
};

var server = restify.createServer();
server.use(restify.bodyParser({ mapParams: true }));

function registerEndpoint(serviceName, domain, endpoint) {
  return function(req, res, next) {
    jwt.verify(req.header('Authorization'), 'secret', function(error, decoded) {
      if (error) {
        res.send(401);
      } else if (decoded) {
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
      }
    });
  };
};

function registerServices() {
  _.each(_.keys(services), function(key) {
    var service = services[key];
    _.each(service.endpoints, function(endpoint) {
      server[endpoint.method](
        key + endpoint.path,
        registerEndpoint(key, service.domain, endpoint)
      );
    });
  });
}

function login(req, res, next) {
  request.post(services.users.domain + '/users/login')
    .send(JSON.parse(req.body))
    .end(function(error, result) {
      if (error) {
        res.send(error.status);
      } else if (result) {
        var json = JSON.parse(result.text);
        json.token = jwt.sign({
          data: json.id
        }, 'secret', { expiresIn: 60 * 60 });
        res.send(result.status, json);
      }
    });
}

registerServices();

server.post('/login', login);

server.listen(8080, function() {
  console.log('%s listening at %s', server.name, server.url);
});
