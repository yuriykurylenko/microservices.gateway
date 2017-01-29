var restify = require('restify');
var request = require('superagent');
var jwt = require('jsonwebtoken');
var _ = require('lodash');

var serviceProxies = {
  users: {
    domain: 'localhost:9292',
    endpoints: [{
      method: 'get',
      path: 'users',
      roles: ['user']
    }]
  },
  tasks: {
    domain: 'localhost:8000',
    endpoints: [{
      method: 'get',
      path: '',
      roles: ['user', 'admin']
    }, {
      method: 'get',
      path: '/my',
      roles: ['user', 'admin']
    }, {
      method: 'post',
      path: '/my',
      roles: ['user', 'admin']
    }]
  }
};

var server = restify.createServer();
server.use(restify.bodyParser({ mapParams: true }));
server.use(
  function crossOrigin(req,res,next){
    res.header("Access-Control-Allow-Origin", "*");
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header("Access-Control-Allow-Headers", "authorization,appkey,content-type");

    next();
  }
);
server.use(restify.CORS());
server.opts(/\.*/, function (req, res, next) {
	res.send(200);
	next();
});

function registerEndpoint(serviceName, domain, endpoint) {
  return function(req, res, next) {
    jwt.verify(req.header('Authorization'), 'secret', function(error, decoded) {
      if (error) {
        res.send(401);
      } else if (decoded) {
        if (decoded.data && !_.includes(endpoint.roles, decoded.data.role)) {
          res.send(403);
        }

        var chain = request[endpoint.method](domain + '/' + serviceName + endpoint.path);
        if (_.includes(['post', 'put', 'patch'], endpoint.method) && req.body) {
          var body = JSON.parse(req.body);
          if (decoded.data.id) {
            body.userId = decoded.data.id;
          }
          chain = chain.send(body);
        } else if (decoded.data.id) {
          chain = chain.query({ userId: decoded.data.id })
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
  _.each(_.keys(serviceProxies), function(key) {
    var service = serviceProxies[key];
    _.each(service.endpoints, function(endpoint) {
      server[endpoint.method](
        key + endpoint.path,
        registerEndpoint(key, service.domain, endpoint)
      );
    });
  });
}

function login(req, res, next) {
  request.post(serviceProxies.users.domain + '/users/login')
    .send(JSON.parse(req.body))
    .end(function(error, result) {
      if (error) {
        res.send(error.status);
      } else if (result) {
        var json = JSON.parse(result.text);
        json.token = jwt.sign({
          data: {
            id: json.id,
            role: json.role
          }
        }, 'secret', { expiresIn: 60 * 60 });
        res.send(result.status, json);
      }
    });
}

function tasksWithUsers(req, res, next) {
  var r1 = new Promise(function(resolve, reject) {
    request.get(serviceProxies.tasks.domain + '/tasks')
      .end(function(error, result) {
        if (error) {
          reject({ status: error.status });
        } else if (result) {
          var json = JSON.parse(result.text);
          resolve({
            status: result.status,
            json: json
          });
        }
      });
  });

  var r2 = new Promise(function(resolve, reject) {
    // console.log(serviceProxies.users.domain);
    request.get(serviceProxies.users.domain + '/users')
      .end(function(error, result) {
        if (error) {
          reject({ status: error.status });
        } else if (result) {
          var json = JSON.parse(result.text);
          resolve({
            status: result.status,
            json: json
          });
        }
      });
  });

  Promise.all([r1, r2]).then(function(values) {
    var tasks = values[0].json;
    var users = values[1].json;

    console.log(tasks);

    res.send(200, _.map(tasks, function(task) {
      console.log(task);
      task.user = _.find(users, { id: task.assignee });
      return task;
    }));
  });
}

registerServices();

server.post('/login', login);
server.get('/tasks-users', tasksWithUsers);

server.listen(8080, function() {
  console.log('%s listening at %s', server.name, server.url);
});
