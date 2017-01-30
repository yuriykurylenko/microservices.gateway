var express = require('express');
var bodyParser = require('body-parser');
var request = require('superagent');
var jwt = require('jsonwebtoken');
var cors = require('cors');

const USERS_SERVICE_BASE_URL = 'http://localhost:9292/users';
const TASKS_SERVICE_BASE_URL = 'http://localhost:8000/tasks';

var user;

function proxy(url, method, data) {
  var chain = request[method](url);
  if (data) { chain = chain.send(data); }
  return new Promise(function(resolve, reject) {
    chain.end(function(error, result) {
      if (error) {
        reject(error.status);
      } else if (result) {
        var json = JSON.parse(result.text);
        resolve({ status: result.status, json: json });
      }
    });
  });
}

function combineRequests(requests, combineResponses) {
  return new Promise(function(resolve, reject) {
    var requestPromises = requests.map(function(request) {
      return proxy(request.url, request.method);
    });

    Promise.all(requestPromises).then(function(results) {
      resolve(combineResponses(
        results.map(function(result) { return result.json; })
      ));
    }, function(error) {
      reject(error);
    });
  });
}

function requireAuthorization(req, res, next) {
  jwt.verify(req.header('Authorization'), 'secret', function(error, decoded) {
    if (error) {
      res.send(401);
    } else {
      user = decoded.data;
      next();
    }
  });
}

function login(req, res) {
  proxy(USERS_SERVICE_BASE_URL + '/login', 'post', req.body)
    .then(function(result) {
      var json = result.json;
      json.token = jwt.sign({
        data: {
          id: json.id,
          role: json.role
        }
      }, 'secret', { expiresIn: 60 * 60 * 24 });
      res.send(result.status, json);
    }, function(error) {
      res.send(error.status);
    });
}

function combineTasksAndUsers(tasksAndUsers) {
  var tasks = tasksAndUsers[0],
      users = tasksAndUsers[1];

  return tasks.map(function(task) {
    task.assignee = users.find(function(user) {
      return user.id == task.assignee;
    }).fname;
    return task;
  });
}

function getTasks(req, res) {
  combineRequests(
    [{ url: TASKS_SERVICE_BASE_URL, method: 'get' },
    { url: USERS_SERVICE_BASE_URL, method: 'get'}],
    combineTasksAndUsers
  ).then(function(result) {
    res.send(200, result);
  }, function(error) {
    res.send(error);
  });
}

function getMyTasks(req, res) {
  combineRequests(
    [{ url: TASKS_SERVICE_BASE_URL + '?userId=' + user.id, method: 'get' },
    { url: USERS_SERVICE_BASE_URL, method: 'get'}],
    combineTasksAndUsers
  ).then(function(result) {
    res.send(200, result);
  }, function(error) {
    res.send(error);
  });
}

var app = express();
app.use(bodyParser());
app.use(cors());

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.post('/login', login);

app.all('*', requireAuthorization);
app.get('/tasks', getTasks);
app.get('/tasks/my', getMyTasks);

app.listen(8080, function () {
  console.log('Gateway listening on port 8080!')
});
