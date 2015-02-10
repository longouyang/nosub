#!/usr/bin/env python

import os
import csv
from datetime import datetime

name = "log.csv"
fields = ["Time","Action","Data"]

logfile = None

writer = None
reader = None


def setup():
	global logfile
	## create file if it doesn't exist
	if not os.path.isfile(name):
	 	print("Creating " + name)
	 	logfile = open(name, 'w')
	 	writer = csv.writer(logfile, delimiter=',', quotechar='"')
	 	writer.writerow(fields)
	 	logfile.close()

def write(d):
	logfile = open(name, 'a')
	d['Time'] = datetime.now().strftime('%Y/%m/%d %H:%M:%S')
	writer = csv.DictWriter(logfile, fieldnames=fields)
	writer.writerow(d)
	logfile.close()

def read():
	logfile = open(name, 'r')
	reader = csv.DictReader(logfile, fieldnames=fields)
	logfile.close()
	return "TODO"