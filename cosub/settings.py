#!/usr/bin/env python

from pytimeparse.timeparse import timeparse
import re

def my_timeparse(_s):
  s = re.sub("and","",_s) 
  return timeparse(s)

def parse(d_raw):
  d = d_raw.copy()

  # HT http://stackoverflow.com/q/9875660/351392 for the idiom
  error_messages = []
  
  # timeparse the approval delay, duration, and lifetime fields
  for k in ["auto_approval_delay", "assignment_duration"]:
    d[k] = my_timeparse(d[k])
    if d[k] is None:
      error_messages.append("- %s must be a duration but it is set to: %s" % (k, d_raw[k])) 

  # int parse the frame height and max assignments
  for k in ["frame_height"]:
    try:
      d[k] = int(d[k])
    except ValueError:
      error_messages.append("- %s must be a number but it is set to: %s" % (k, d_raw[k]))

  # float parse the reward
  for k in ["reward"]:
      try:
        d[k] = float(d[k])
      except ValueError:
        error_messages.append("- %s must be a price but it is set to: %s" % (k, d_raw[k]))

  num_errors = len(error_messages)
  if len(error_messages) > 0:
    print("Error%s parsing %s:" % ("" if num_errors == 1 else "s", settings_filename))
    sys.exit("\n".join(error_messages))
  
  return d