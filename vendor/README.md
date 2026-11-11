# vendor/

Third-party code served from this site's own origin instead of a CDN.

A `<script src="https://unpkg.com/...">` with no `integrity` attribute is an
open door: whatever that host returns runs with full access to this origin,
and a version pin does not help, because the pin says *which file* to ask for
and nothing about *what comes back*. Serving the file from here closes it, and
removes a second site from the list of things that have to be up for DrumSeek
to work.

## peerjs-1.5.4.min.js

PeerJS 1.5.4, MIT licensed, used by `drumseek.html` for its WebRTC peer links.

Taken from the npm tarball, not from a CDN, and checked against the hash the
registry publishes for that release:

    sha512-yFsoLMnurJKlQbx6kVSBpOp+AlNldY1JQS2BrSsHLKCZnq6t7saHleuHM5svuLNbQkUJXHLF3sKOJB1K0xulOw==

The extracted `dist/peerjs.min.js` is byte-identical to what unpkg was
serving, so nothing about the site's behaviour changes — only where the file
comes from and whether anyone could have substituted it.

    sha384-nlUQ8ZqCbvStErob+biJNzSgltf6urV3VGqhfIfzhmg9RXmpeRm76ELw0pYnKlTR

To update: fetch the new tarball, verify it against the registry's `integrity`
field, extract `dist/peerjs.min.js`, and change the filename here and the one
`<script src>` in `drumseek.html` together, so the version is never a guess.
