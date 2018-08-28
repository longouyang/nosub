var _ = require('lodash');

var cl = console.log

var unitsToSeconds = {second: 1, minute: 60, hour: 3600, day: 86400, week: 604800};

var durationRegexPattern = /(\d+\.?\d*)\s*(second|minute|hour|day|week)s?/;

// converts a string input to a number of seconds
// can use multiple units, e.g., "1 hour and 30 minutes"
// can use decimal numbers, e.g., "1.5 hours"
function extractDuration(x) {

  var rxAll = new RegExp(durationRegexPattern, 'g');
  var matches = x.match( rxAll );
  //console.log(matches)

  // can't reuse previous regexp because global matching appears to cause problems
  var rxSub = new RegExp(durationRegexPattern)

  var seconds = _.sum(
    _.map(matches,
          function(str) {
            //cl(str)
            var match = rxSub.exec(str)
            //cl(match)
            var numUnits = parseFloat(match[1]),
                unit = match[2];

            //console.log('extracted duration: ' + unit + ', ' + numUnits)

            return numUnits * unitsToSeconds[unit];

          }
         )


  )

  return seconds

}

function validateDuration(x) {
  var rx = new RegExp(durationRegexPattern);
  return rx.test(x)
}

module.exports = {
	extractDuration: extractDuration,
	validateDuration: validateDuration
}



// testing

//cl(extractDuration("0.1428571429 weeks, 1 day, and 24 hours")) // 259200
//cl(extractDuration("8 hours")) // 28800
//cl(extractDuration("1 hour and 30 minutes")) // 5400
//console.log(extractDuration("0.1428571429 weeks" /* 1 day */))
//cl(extractDuration("15 assignments and 8 hours")) // 28800
