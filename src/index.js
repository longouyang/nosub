var AWS = require('aws-sdk');

AWS.config.update({region:'us-east-1'});

var mturk = new AWS.MTurk({apiVersion: '2017-01-17'});
// interactive version
function create() {
  mturk.getAccountBalance({}, function(err, data) {
    if (err) console.log(err, err.stack); // an error occurred
    else     console.log(data);           // successful response
  });
}

var args = process.argv.slice(2);

var action = args[0];

if (action == 'create') {
  create()
}
