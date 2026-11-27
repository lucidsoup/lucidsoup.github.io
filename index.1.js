        // Redirect HTTP -> HTTPS so camera and microphone access work.
        // GitHub Pages serves HTTPS, so we should always be there.
        // Skip on localhost so dev still works.
        (function() {
            if (location.protocol === 'http:' &&
                location.hostname !== 'localhost' &&
                location.hostname !== '127.0.0.1') {
                location.replace('https://' + location.host + location.pathname + location.search + location.hash);
            }
        })();
    
