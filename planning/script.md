# Slide 1. What RLMask Does
## Introduction
Hello, we are Team "[Team Name]," and this is RLMask.
RLMask turns sensitive data into data that AI can safely learn from.

## Problem
Some of the most valuable data for AI is inside hospitals and banks.
But it is full of names, birth dates, Social Security numbers, and addresses, so it can't leave the building.
The usual fix is masking, which replaces every name with a tag like [NAME].
That also erases the context a model learns from: who the patient is, who the family member is, and how many days passed between visits.
So the data stays locked away, and AI companies can't use it.

## Solution
RLMask doesn't delete personal information. It replaces it with consistent virtual personas.
The same patient becomes the same fictional person in every table, note, image, and recording.
Diagnoses, prescriptions, and time intervals stay exactly as they were.
We are starting in the United States, with hospitals and the RL eval and training-data companies that need their data.

# Slide 2. Product Demo

## Load the Data
On the first screen, we load a synthetic US hospital dataset: a patient table, clinical notes, and media files such as an ECG printout, an insurance card, and a voicemail.
In the real product, RLMask connects to the customer's database with read-only access.

## Detect & Replace
Next, we run a masking job. The pipeline view shows every step and where it runs.
A language model reads each note and finds personal information in context: the patient, a daughter mentioned only by her first name, an employer, and a record number buried in the text.
In this demo, Claude does the detection. In the product, a local model does the same job.
Then our code replaces each value using a persona mapping table, so the same input always gives the same output.
Dates move by a fixed offset for each patient, so the gaps between visits are preserved.

## Verify Privacy & Utility
The results screen shows the original and masked records side by side, with every replacement highlighted.
Then we check two things.
Privacy: zero original values remain after 502 replacements, and all 78 pieces of personal information in the images and audio were found.
Utility: all 14 checks pass. Visit intervals, age distribution, readmission rate, and the links between tables match the original.

## Business Model
Hospital data can't come out, so we go in.
We sell RLMask as installed software that runs inside the customer's network with a local model, so nothing is sent to an outside API.
Revenue comes from a license fee for each installation, plus an annual subscription for deployment and updates.
Hospitals and banks use it to share or sell their data, and AI companies finally get data they can train on.

## Our Team — Optional
[Team members' background: e.g., US experience, data/ML, deployment engineering]

## Closing
Data that used to be locked away can now be put to work, safely.
Thank you for listening. We welcome your questions.
