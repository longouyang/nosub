# cosub

A command-line tool for creating external HITs on Amazon's Mechanical Turk.

**Note: under rapid development; this document is incomplete**

## Philosophy

Many behavioral scientists use a Mechanical Turk workflow where they create a single External HIT with many assignments.
This corresponds to a single experiment with many participants.
The same HIT is often repurposed for multiple versions of the same experiment, so there's a need for a HIT management tool that facilitates multiple rounds of data collection and updating.

## Requirements

Python and pip. See `requirements.txt` for the pip dependencies.

## Installation

**Note: install instructions are likely to change**

OSX:

```sh
sudo pip install -U setuptools
sudo pip install git+git://github.com/longouyang/cosub.git
```

Note that you probably only need to run the first line if you're on Mavericks.

Windows:

```sh
pip install git+git://github.com/longouyang/cosub.git
```

## Usage

**Note: Folder structure, configuration format, and command arguments are likely to change**

Go to a folder where you want to store your settings and results for a single HIT.
Inside that folder, place your AWS authentication credentials in `auth.json`, e.g.,

```js
{
    "access_id": "...",
    "secret_key": "..."
}
```

and add your HIT settings to `settings.json`, e.g.,

```js
{
    "title":               "Numbers game",
    "description":         "A simple game about categorizing numbers",
    "keywords":            "Memory, cards",
    "url":                 "https://longouyang.github.io/even-odd/even-odd.html",
    "frame_height":         450,
    "assignment_duration":  "1 hour",
    "auto_approval_delay":  "5 minutes",
    "reward":               0.60,
    "qualifications": {
        "location": "US",
        "approval_percentage": 85
    }
}
```

Now, you can perform these actions:

    cosub create
    cosub update
    cosub add <N> assignments
    cosub add <N> {days/hours/minutes}
    cosub expire
    cosub download

You can also combine adding assignments and time:

    cosub add 40 assignments and 3 hours

## Etymology

cosub is descended, in spirit, from Dan Lassiter's [Submiterator](https://github.com/danlassiter/Submiterator). The name means **c**hild **o**f **sub**miterator.
