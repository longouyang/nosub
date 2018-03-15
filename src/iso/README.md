countries.js adapted from https://github.com/moimikey/iso3166-1/blob/master/data/countries.json

R code to process it:

```
library(dplyr)
library(jsonlite)

d = fromJSON('https://raw.githubusercontent.com/moimikey/iso3166-1/master/data/countries.json') %>%
  rename(c2 = alpha2, c3 = alpha3)

write(file = 'countries.js',
      x = paste0('module.exports = ',
                 toJSON(d)))
```

subdivisions.js adapted from https://github.com/olahol/iso-3166-2.js/blob/master/data.csv

R code to process it:

```
library(readr)
library(dplyr)
library(jsonlite)

d = read_csv('https://raw.githubusercontent.com/olahol/iso-3166-2.js/master/data.csv',
             col_names = c('CountryName','SubdivisionCode','SubdivisionName', 'SubdivisionType', 'Country2Code'))

write(file = 'subdivisions.js',
      x = paste0('module.exports = ',
             toJSON(d %>%
                      select(Country2Code, SubdivisionCode) %>%
                      rename(c2 = Country2Code, sub = SubdivisionCode))))
```
