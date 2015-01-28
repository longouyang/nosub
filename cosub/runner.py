#!/usr/bin/env python

import boto.mturk.connection as connection
import boto.mturk.question as question
from datetime import datetime, timedelta
import pickle
import sys
import csv
import json
import math
import re
import os.path
from pprint import pprint as pp
from pytimeparse.timeparse import timeparse

from boto.mturk.qualification import LocaleRequirement, PercentAssignmentsApprovedRequirement, Qualifications

HOST = 'mechanicalturk.sandbox.amazonaws.com'

in_sandbox = "sandbox" in HOST
mode = "sandbox" if in_sandbox else "production"

HOST_requester = "https://" + ("requestersandbox" if in_sandbox else "requester") + ".mturk.com"
HOST_worker = "https://" + ("workersandbox" if in_sandbox else "www") + ".mturk.com"

argv = sys.argv[1:]

## TODO: add --comment flag
if len(argv) == 0:
  print "\n".join(["",
                   "Usage: ",
                   "",
                   "   cosub create hit",
                   "   cosub update hit",
                   "   cosub add <N> assignments",
                   "   cosub add <N> {days/hours/minutes}",
                   "   cosub expire",
                   "   cosub show status",
                   "   cosub get results",
                   ""
                 ]) 
  sys.exit()

if not os.path.isfile("auth.json"):
  sys.exit("Couldn't find credentials file auth.json")

auth_data = json.load(open("auth.json", "r"))
ACCESS_ID = auth_data["access_id"]
SECRET_KEY = auth_data["secret_key"]

# get name of the settings file, append .json if necessary  
settings_filename = "settings.json"
#settings_filename = settings_filename + ("" if re.search("\.json$","settings_filename") else ".json")
#stem = re.sub("\.json$", "", settings_filename)
log_filename = "log.csv"

# create a log if it doesn't exist
if not os.path.isfile(log_filename):
  print "- Creating " + log_filename
  with open(log_filename, 'w') as log_file:
    log_writer = csv.writer(log_file, delimiter=',', quotechar='"')
    log_writer.writerow(["Time", "Action", "Data"])

# read log    
log = []
with open(log_filename, 'r') as log_file:
  log_rows = []
  log_reader = csv.reader(log_file, delimiter=',', quotechar='"')
  for row in log_reader:
    log_rows.append(row)

  keys = log_rows[0]
  for row in log_rows[1:]:
    log.append(dict(zip(keys,row)))

# compare settings to the most recent create / update entry in the log
settings_raw = json.load(open(settings_filename, "r"))

def my_timeparse(_s):
  s = re.sub("and","",_s) 
  return timeparse(s)

def parse_settings(dRaw):
  d = dRaw.copy()

  # HT http://stackoverflow.com/q/9875660/351392 for the idiom
  error_messages = []
  
  # timeparse the approval delay, duration, and lifetime fields
  for k in ["auto_approval_delay", "assignment_duration"]:
    d[k] = my_timeparse(d[k])
    if d[k] is None:
      error_messages.append("- %s must be a duration but it is set to: %s" % (k, dRaw[k])) 

  # int parse the frame height and max assignments
  for k in ["frame_height"]:
    try:
      d[k] = int(d[k])
    except ValueError:
      error_messages.append("- %s must be a number but it is set to: %s" % (k, dRaw[k]))

  # float parse the reward
  for k in ["reward"]:
      try:
        d[k] = float(d[k])
      except ValueError:
        error_messages.append("- %s must be a price but it is set to: %s" % (k, dRaw[k]))

  num_errors = len(error_messages)
  if len(error_messages) > 0:
    print "Error%s parsing %s:" % ("" if num_errors == 1 else "s", settings_filename )
    sys.exit("\n".join(error_messages))
  
  return d

settings_log_text = None
for line in log:
  if line['Activity'] in ['Create', 'Update']:
    settings_log_text = line['Data']
settings_log_raw = json.loads(settings_log_text) if settings_log_text else settings_raw

settings_in_log = parse_settings(settings_log_raw)
settings_in_file = parse_settings(settings_raw)

action = " ".join(argv[0:2])

settings_modified = (action is not "show status" and settings_in_log is not settings_in_file)

# TODO: bail if settings modified

settings = settings_in_file

hit_ids = dict()
hit_id = None

if os.path.isfile("hit_ids.json"):
  hit_ids = json.load(open("hit_ids.json", "r"))
  hit_id = hit_ids[mode]["hit_id"]

mtc = connection.MTurkConnection(aws_access_key_id=ACCESS_ID,
                                 aws_secret_access_key=SECRET_KEY,
                                 host=HOST)

# convert a time delta to a humane string representation
# adapted from http://code.activestate.com/recipes/578113-human-readable-format-for-a-given-time-delta/
def humane_timedelta(delta, precise=False, fromDate=None):
    # the timedelta structure does not have all units; bigger units are converted
    # into given smaller ones (hours -> seconds, minutes -> seconds, weeks > days, ...)
    # but we need all units:
    deltaMinutes      = delta.seconds // 60
    deltaHours        = delta.seconds // 3600
    deltaMinutes     -= deltaHours * 60
    deltaWeeks        = delta.days    // 7
    deltaSeconds      = delta.seconds - deltaMinutes * 60 - deltaHours * 3600
    deltaDays         = delta.days    - deltaWeeks * 7
    deltaMilliSeconds = delta.microseconds // 1000
    deltaMicroSeconds = delta.microseconds - deltaMilliSeconds * 1000

    valuesAndNames =[ (deltaWeeks  ,"week"  ), (deltaDays   ,"day"   ),
                      (deltaHours  ,"hour"  ), (deltaMinutes,"minute"),
                      (deltaSeconds,"second") ]
    if precise:
        valuesAndNames.append((deltaMilliSeconds, "millisecond"))
        valuesAndNames.append((deltaMicroSeconds, "microsecond"))

    text =""
    for value, name in valuesAndNames:
        if value > 0:
            text += len(text)   and ", " or ""
            text += "%d %s" % (value, name)
            text += (value > 1) and "s" or ""

    # replacing last occurrence of a comma by an 'and'
    if text.find(",") > 0:
        text = " and ".join(text.rsplit(", ",1))

    return text

def create_hit(settings):
  ## make sure there isn't already a hit
  if (hit_id is not None):
    sys.exit("It looks like you already created the hit (mode: %s)" % mode)
  
  hit_quals = Qualifications() 
  settings_quals = settings["qualifications"] 
  ## TODO: master worker, custom quals, utility for creating qualifications?
  if (settings_quals):
    if settings_quals["location"]: 
      hit_quals.add(LocaleRequirement("EqualTo", settings_quals["location"]))

    if settings_quals["approval_percentage"]: 
      hit_quals.add(PercentAssignmentsApprovedRequirement("GreaterThanOrEqualTo",
                                                          settings_quals["approval_percentage"]))

  ## NB: max_assignments and lifetime are different for sandbox versus production
  hit_settings = dict(
    title           = settings["title"],
    description     = settings["description"],
    keywords        = settings["keywords"],
    question        = question.ExternalQuestion(settings["url"], settings["frame_height"]),
    max_assignments = 20 if in_sandbox else 1,
    reward          = settings["reward"],
    approval_delay  = timedelta(seconds = settings["auto_approval_delay"]),
    duration        = timedelta(seconds = settings["assignment_duration"]),
    lifetime        = timedelta(days = 7) if in_sandbox else timedelta(seconds = 30),
    qualifications  = hit_quals
  ) 
  create_hit_result = mtc.create_hit(**hit_settings)
  
  hit = create_hit_result[0]

  hit_data = dict()
  hit_data[mode] = dict(
    hit_id = hit.HITId,
    # hit_group_id = hit.HITGroupId,
    hit_type_id = hit.HITTypeId)

  print "  Successfully created HIT"
  # print "\n".join(["  HIT ID      : %s" % hit_id,
  #                  # "  HIT Group ID: %s" % hit.hit_group_id,
  #                  "  HIT Type ID : %s" % hit_type_id])

  print "* Because you are in %s mode, the number of initial assignments is set to %s and the initial HIT lifetime is set to %s" % (mode, hit_settings["max_assignments"], humane_timedelta(hit_settings["lifetime"]) )

  ## write hit and HITTypeId into even-odd.json
  with open("hit_ids.json", 'w') as new_settings_file:
    json.dump(hit_data, new_settings_file, indent=4, separators=(',', ': '))
    print "  Wrote HIT ID and HIT Type ID to hit_ids.json"

  print("")
  print("Link to manage HIT: ")
  print(HOST_requester + "/mturk/manageHIT?HITId=" + hit.HITId)

  # # todo: boto isn't returning HITGroupId atm. how does CLT do it?
  # print("")
  # print("Link to view HIT: ")
  # print(HOST_worker + "/mturk/preview?groupId=" + GROUPIDFIXME)
  # print("")

  ## TODO: write data to log

def get_results(host, mode, hit_id):
  results_dir = "%s results" % mode

  if not os.path.exists(results_dir):
    os.makedirs(results_dir)

  page_size = 50.0

  ## based on number of files in results_dir, find the number of pages we've already downloaded
  downloaded_assignments = map(lambda _: _.replace(".json",""),
                               filter(lambda _: _.find(".json") > - 1,
                                      os.listdir(results_dir)))
  num_downloaded_assignments = len(downloaded_assignments)
  print "Currently have " + str(num_downloaded_assignments) + " results" 

  if num_downloaded_assignments % int(page_size) == 0:
    num_downloaded_pages = (num_downloaded_assignments / int(page_size)) + 1
  else:
    num_downloaded_pages = int(math.ceil(num_downloaded_assignments / page_size))

  ## submit a dummy request for page_size = 1 so that we can get the total number of assignments
  num_total_assignments = int( mtc.get_assignments(hit_id, page_size = 1).TotalNumResults )
  num_total_pages = int(math.ceil(num_total_assignments / page_size))
  print "Mturk has " + str(num_total_assignments) + " results"

  if num_downloaded_assignments == num_total_assignments:
    sys.exit("Done")

  assignments_to_write = []
  
  for i in range(num_downloaded_pages, num_total_pages + 1):
    print "Downloading page " + str(i) + " of results" 
    assignments_to_write += mtc.get_assignments(hit_id, page_size = int(page_size), page_number = i)
  
  for a in assignments_to_write:
    aId = a.AssignmentId
    
    ## if we've downloaded this one before, don't write to disk
    if aId in downloaded_assignments:
      print "Skipped " + aId
      continue
    
    ## otherwise, write to disk
    data = a.__dict__
    data["answer"] = json.loads( a.answers[0][0].fields[0] )
    data.pop("answers",None)
    
    with open(results_dir + "/" + aId + ".json","w") as f:
      jsonData = json.dumps(data, indent=4, separators=(',', ': '))
      f.write(jsonData)
    
    print "Wrote   " + aId
  
  print "Done" 

def go():
  if action=="create hit":
    create_hit(settings)

  if action=="get results":
    if hit_id is None:
      sys.exit("You haven't created the hit on Turk yet (mode: %s)" % mode)
    get_results(HOST, mode, hit_id)
