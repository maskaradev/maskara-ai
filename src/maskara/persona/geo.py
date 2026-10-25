"""US geography tables the coherence chain needs: states, Census regions, area codes, street names."""

from __future__ import annotations

STATES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California",
    "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "DC": "District of Columbia",
    "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana",
    "IA": "Iowa", "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri",
    "MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey",
    "NM": "New Mexico", "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio",
    "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont",
    "VA": "Virginia", "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
    "PR": "Puerto Rico", "VI": "U.S. Virgin Islands",
}
STATE_CODES = {name.casefold(): code for code, name in STATES.items()}

# Census Bureau regions. The territories are not in any region; they form their own.
REGIONS = {
    "Northeast": "CT ME MA NH RI VT NJ NY PA",
    "Midwest": "IL IN MI OH WI IA KS MN MO NE ND SD",
    "South": "DE DC FL GA MD NC SC VA WV AL KY MS TN AR LA OK TX",
    "West": "AZ CO ID MT NV NM UT WY AK CA HI OR WA",
    "Territories": "PR VI",
}
REGION = {code: region for region, codes in REGIONS.items() for code in codes.split()}

# A few real area codes per state. Paired with the fictional 555-0100..0199 exchange, the number
# looks local but cannot ring anyone.
AREA_CODES = {
    "AL": "205 251 256 334", "AK": "907", "AZ": "480 520 602 623 928", "AR": "479 501 870",
    "CA": "213 310 415 510 559 619 626 650 714 760 805 818 858 909 916 925 949", "CO": "303 719 720 970",
    "CT": "203 860", "DE": "302", "DC": "202", "FL": "305 321 352 407 561 727 813 850 904 954",
    "GA": "404 470 478 678 706 770 912", "HI": "808", "ID": "208", "IL": "217 309 312 618 630 708 773 815 847",
    "IN": "219 260 317 574 765 812", "IA": "319 515 563 641 712", "KS": "316 620 785 913",
    "KY": "270 502 606 859", "LA": "225 318 337 504 985", "ME": "207", "MD": "240 301 410 443",
    "MA": "413 508 617 781 978", "MI": "231 248 269 313 517 586 616 734 810 906 989",
    "MN": "218 320 507 612 651 763 952", "MS": "228 601 662", "MO": "314 417 573 636 660 816", "MT": "406",
    "NE": "308 402", "NV": "702 775", "NH": "603", "NJ": "201 609 732 856 908 973", "NM": "505 575",
    "NY": "212 315 516 518 585 607 631 716 718 845 914", "NC": "252 336 704 828 910 919", "ND": "701",
    "OH": "216 330 419 440 513 614 740 937", "OK": "405 580 918", "OR": "503 541 971",
    "PA": "215 412 570 610 717 724 814", "RI": "401", "SC": "803 843 864", "SD": "605",
    "TN": "423 615 731 865 901 931", "TX": "210 214 254 281 361 409 512 713 806 817 830 903 915 936 940 956 972",
    "UT": "435 801", "VT": "802", "VA": "276 434 540 703 757 804", "WA": "206 253 360 425 509", "WV": "304",
    "WI": "262 414 608 715 920", "WY": "307", "PR": "787 939", "VI": "340",
}

STREETS = (
    "Oak", "Maple", "Cedar", "Pine", "Elm", "Walnut", "Willow", "Birch", "Spruce", "Chestnut", "Hickory",
    "Magnolia", "Sycamore", "Juniper", "Main", "Park", "Lake", "Hill", "River", "Spring", "Meadow", "Ridge",
    "Valley", "Forest", "Sunset", "Highland", "Prospect", "Church", "Washington", "Lincoln", "Jefferson",
    "Madison", "Franklin", "Adams", "Jackson", "Monroe", "Grant", "Center", "Union", "Mill", "Orchard",
    "Harbor", "Garden", "Mountain", "Fairview", "Pleasant", "Woodland", "Lakeview", "Cherry", "Laurel",
    "Aspen", "Poplar",
)
# Suffix -> USPS abbreviation.
STREET_SUFFIXES = {
    "Street": "St", "Avenue": "Ave", "Road": "Rd", "Drive": "Dr", "Lane": "Ln", "Court": "Ct",
    "Boulevard": "Blvd", "Way": "Way", "Place": "Pl", "Circle": "Cir", "Terrace": "Ter", "Trail": "Trl",
}
