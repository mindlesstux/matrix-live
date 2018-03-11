# Changelog for Matrix Live

## Changes in v0.1.5 (2018-03-04)

- Support for m.audio messages, which will be displayed as inline HTML5 audio player (thanks, greenjon)

## Changes in v0.1.4 (2017-03-31)

- Bugfix: Invites messed up display names (argit/matrix-live#1)
- Don't display empty display names, use MXID instead
- demo2.html should use relative links


## Changes in v0.1.3 (2016-12-17)

- Critial fix: New synapse releases expect a valid JSON body for register?kind=guest requests, which made guest registration fail on matrix.org homeserver


## Changes in v0.1.2 (2016-11-30)

- Client now stores access_token and thus does not re-register every time the page reloads


## Changes in v0.1.1 (2016-11-28)

- Initial public release
