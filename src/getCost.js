var _ = require('lodash');

// note: i made the premium-qualifications file by manually scraping data from mturk requester / requestersandbox web interfaces for creating HITs
// then did some manual munging. and used csvtojson to make a js file
// notes:
// - 2012 US election exists on production but not sandbox.
// - scraped ampersands turned into &amp; so i did a find-replace on those
var premiumQualifications = require('./premium-qualifications')
async function getCost(opts, assignments, qualifications) {
  var reward = parseFloat(opts.Reward);

  var addedFees = 0;
  var nominalCost = reward * assignments

  var qNames = _.map(qualifications, 'Name')
  var qIds = _.map(qualifications, 'QualificationTypeId')

  if (_.includes(qNames, 'Masters')) {
    addedFees += 0.05; // 5% fee for masters
  }

  if (opts.Batch) {
    addedFees += 0.2;
  } else {
    // 20% extra fee if total number of assignments greater than 10
    addedFees += (assignments > 9 ? 0.4 : 0.2);
  }

  var totalCost = nominalCost * (1 + addedFees)

  _.each(qIds, function(id) {
    var premiumEntry = _.find(premiumQualifications,
                              function(pq) { return pq.sandboxId == id || pq.productionId == id})
    if (premiumEntry) {
      totalCost += premiumEntry.feeInDollars
    }
  })

  return totalCost

}

module.exports = getCost
