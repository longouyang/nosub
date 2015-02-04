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
import pdb
from pprint import pprint as pp
from pytimeparse.timeparse import timeparse
from boto.mturk.qualification import LocaleRequirement, PercentAssignmentsApprovedRequirement, Qualifications
from boto.mturk.connection import MTurkRequestError
import settings

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

## mode settings (sandbox vs production)
HOST = 'mechanicalturk.sandbox.amazonaws.com'
in_sandbox = "sandbox" in HOST
mode = "sandbox" if in_sandbox else "production"
HOST_requester = "https://" + ("requestersandbox" if in_sandbox else "requester") + ".mturk.com"
HOST_worker = "https://" + ("workersandbox" if in_sandbox else "www") + ".mturk.com"

argv = sys.argv[1:]

## if no args, bail
## TODO: add --comment flag
if len(argv) == 0:
  print("\n".join(["",
                   "Usage: ",
                   "",
                   "   cosub create hit",
                   "   cosub update hit (TODO)",
                   "   cosub add <N> assignments",
                   "   cosub add <N> {days/hours/minutes}",
                   "   cosub expire      (TODO)",
                   "   cosub show status (TODO)",
                   "   cosub get results (HALF)",
                   ""
                 ]))
  sys.exit()

if not os.path.isfile("auth.json"):
  sys.exit("Couldn't find credentials file auth.json")

action = " ".join(argv).lower()

auth_data = json.load(open("auth.json", "r"))
ACCESS_ID = auth_data["access_id"]
SECRET_KEY = auth_data["secret_key"]

## get name of the settings file, append .json if necessary
settings_filename = "settings.json"
#settings_filename = settings_filename + ("" if re.search("\.json$","settings_filename") else ".json")
#stem = re.sub("\.json$", "", settings_filename)
log_filename = "log.csv"

## create a log if it doesn't exist
if not os.path.isfile(log_filename):
  print("  Creating " + log_filename)
  with open(log_filename, 'w') as log_file:
    log_writer = csv.writer(log_file, delimiter=',', quotechar='"')
    log_writer.writerow(["Time", "Action", "Data"])

## read log
log = []
with open(log_filename, 'r') as log_file:
  log_rows = []
  log_reader = csv.reader(log_file, delimiter=',', quotechar='"')
  for row in log_reader:
    log_rows.append(row)

  keys = log_rows[0]
  for row in log_rows[1:]:
    log.append(dict(zip(keys,row)))

## compare settings to the most recent create/update entry in the log
with open(settings_filename, "r") as f:
  lines = f.readlines()
  # remove comments in json
  lines = map(lambda line: re.sub("/\*.*\*/", "", line), lines)
  settings_file_contents = "".join(lines)
settings_raw = json.loads(settings_file_contents)
settings_log_text = None
for line in log:
  if line['Activity'] in ['Create', 'Update']:
    settings_log_text = line['Data']
settings_log_raw = json.loads(settings_log_text) if settings_log_text else settings_raw
settings_in_log = settings.parse(settings_log_raw)
settings_in_file = settings.parse(settings_raw)
settings_modified = (action is not "show status" and settings_in_log is not settings_in_file)
# TODO: bail if settings modified
settings = settings_in_file

## load hit metadata if it iexists
hit_modes = dict()
hit = None
if os.path.isfile("hit_modes.json"):
  hit_modes = json.load(open("hit_modes.json", "r"))
  hit = hit_modes[mode]

## connect to amazon
mtc = connection.MTurkConnection(aws_access_key_id=ACCESS_ID,
                                 aws_secret_access_key=SECRET_KEY,
                                 host=HOST)
 
def create_hit(settings):
  global hit
  ## make sure there isn't already a hit
  if (hit is not None):
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
  request_settings = dict(
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
  try:
    create_result = mtc.create_hit(**request_settings)[0]
  except MTurkRequestError as e:
    print("Error\n")
    pp(e.__dict__)
    sys.exit(1)

  hit = {
    "id": create_result.HITId,
    # hit_group_id = hit.HITGroupId,
    "type_id": create_result.HITTypeId
  }

  hit_modes[mode] = hit

  print("Successfully created HIT")
  ## write hit and HITTypeId into even-odd.json
  with open("hit_modes.json", 'w') as new_settings_file:
    json.dump(hit_modes, new_settings_file, indent=4, separators=(',', ': '))
    print("Wrote HIT ID and HIT Type ID to hit_modes.json")

  print("\n".join(["Because you are in %s mode:" % mode, 
                   "- the number of initial assignments is set to %s" % request_settings["max_assignments"],
                   "- the initial HIT lifetime is set to %s" % humane_timedelta(request_settings["lifetime"])]))
    
  print("")
  print("Link to manage HIT: ")
  print(HOST_requester + "/mturk/manageHIT?HITId=" + hit["id"])

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
  print("Currently have " + str(num_downloaded_assignments) + " results")

  if num_downloaded_assignments % int(page_size) == 0:
    num_downloaded_pages = (num_downloaded_assignments / int(page_size)) + 1
  else:
    num_downloaded_pages = int(math.ceil(num_downloaded_assignments / page_size))

  ## submit a dummy request for page_size = 1 so that we can get the total number of assignments
  num_total_assignments = int( mtc.get_assignments(hit_id, page_size = 1).TotalNumResults )
  num_total_pages = int(math.ceil(num_total_assignments / page_size))
  print("Mturk has " + str(num_total_assignments) + " results")

  if num_downloaded_assignments == num_total_assignments:
    sys.exit("Done")

  assignments_to_write = []
  
  for i in range(num_downloaded_pages, num_total_pages + 1):
    print("Downloading page " + str(i) + " of results")
    assignments_to_write += mtc.get_assignments(hit_id, page_size = int(page_size), page_number = i)
  
  for a in assignments_to_write:
    aId = a.AssignmentId
    
    ## if we've downloaded this one before, don't write to disk
    if aId in downloaded_assignments:
      print("Skipped " + aId)
      continue
    
    ## otherwise, write to disk
    data = a.__dict__
    data["answer"] = json.loads( a.answers[0][0].fields[0] )
    data.pop("answers",None)
    
    with open(results_dir + "/" + aId + ".json","w") as f:
      jsonData = json.dumps(data, indent=4, separators=(',', ': '))
      f.write(jsonData)
    
    print("Wrote   " + aId)
  print("Done")

def add_time(hit, n):
  res = mtc.extend_hit(hit_id = hit["id"],
                       expiration_increment = n)

def add_assignments(hit, n):
  res = mtc.extend_hit(hit_id = hit["id"],
                       assignments_increment = n)
  
def go(): 
  if not (action in ["status", "create hit"]) and hit["id"] is None:
    sys.exit("You haven't created the hit on Turk yet (mode: %s)" % mode)
  
  if action == "create hit":
    create_hit(settings)

  if action == "update hit":
    sys.exit("TODO")

  if action == "get results":
    get_results(HOST, mode, hit["id"])

  ## add time, assignments, or both
  if re.match("^add ", action):
    action_ = re.sub("add ","", action)
    num_assignments = 0
    td = None
    # extract assignments
    assignments_search = re.search("([0-9]+) *assignments", action_)
    if (assignments_search):
      num_assignments = int(assignments_search.group(1))
      print("Adding %d assignments" % num_assignments)
      action_ = re.sub(assignments_search.group(0), "", action_)
      action_ = re.sub("and", "", action_)
      add_assignments(hit, num_assignments)
      print "-> Done"

    # time parse the rest
    seconds = timeparse(action_)

    if (seconds is not None):
      print("Adding %s" % humane_timedelta(timedelta(seconds = seconds))) 
      add_time(hit, seconds)
      print "-> Done" 
    
  if action == "show status":
    sys.exit("TODO")

  if action == "expire":
    sys.exit("TODO")

if __name__ == "__main__":
    go()