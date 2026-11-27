// Copy buttons. The clipboard API needs a secure context, which this page has;
// if it is ever refused, say so rather than appearing to have worked.
document.querySelectorAll('.copy').forEach(function (b) {
    b.addEventListener('click', function () {
        var text = b.getAttribute('data-copy');
        var done = function (msg) {
            var was = b.textContent;
            b.textContent = msg;
            setTimeout(function () { b.textContent = was; }, 1400);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () { done('copied'); },
                                                     function () { done('select it'); });
        } else {
            done('select it');
        }
    });
});
