// A simple function to print out any arguments passed to it.
function emit() {
    var f = 'Spy("out").func(';
    for (var i = 0; i < arguments.length; i++) {
        f += "arguments["+i+"]";
        if (i < arguments.length -1) f += ",";
    }
    f += ");";
    eval(f);
}

function wait() {
  Spy('out').wait();
}

function snippet() {
  /* This is intentionally empty; we pass functions containing
   * doctests in here so that they're not executed on page
   * load. */
}

jQuery.fn.extend({
  // Assuming the first matched element is a script tag,
  // return its inline source code.
  sourceCode: function() {
    // MSIE 8 uses the 'text' property for script elements,
    // while other browsers support standard DOM access.
    return $(this).get(0).text || $(this).text();
  },
  // Syntax highlight the set of matched elements using
  // the given language.
  syntaxHighlight: function(language) {
    this.each(function() {
      sh_highlightElement(this, sh_languages[language]);
    });
  }
});

$(window).ready(function() {
  function convertSnippetScriptsToDoctests() {
    $("script.doctest").each(function() {
      var doctestLines = [];
      var lines = $(this).sourceCode().split('\n');
      var inPrompt = false;
      jQuery.each(lines, function() {
        var expect = this.match(/^  \/\/ expect: (.*)/);
        if (expect) {
          doctestLines.push(expect[1]);
          inPrompt = false;
        } else if (this.match(/^  /)) {
          var prompt = inPrompt ? '>' : '$';
          doctestLines.push(prompt + this.slice(1));
          inPrompt = true;
        }
      });
      var pre = $('<pre class="doctest"></pre>');
      $(this).replaceWith(pre.text(doctestLines.join('\n')));
    });
  }

  function trimDoctests() {
    $("pre.doctest").each(function() {
      $(this).text(jQuery.trim($(this).text()));
    });
  }

  function collapseMoreSections() {
    $('.more').each(function() {
      var link = $("#templates .more-link").clone();
      var section = $(this);
      link.find(".title").text(section.attr("title"));
      link.children("span").click(function() {
        section.slideDown();
        link.remove();
      });
      section.before(link).hide();
    });
  }

  convertSnippetScriptsToDoctests();
  trimDoctests();
  collapseMoreSections();
});

$(window).load(function() {
  function loadChildCodeSnippets() {
    var harnessChan = Channel.build({
      window: $("#childId").get(0).contentWindow,
      origin: "*",
      scope: "harness",
      onReady: function() {
        $(".child-code-snippet").each(function() {
          var element = this;
          harnessChan.call({
            method: "getScript",
            params: this.id,
            success: function(code) {
              code = jQuery.trim(code);
              var elem = $('<code></code>').text(code);
              elem.syntaxHighlight('javascript');
              $(element).append(elem);
            }
          });
        });
      }
    });    
  }

  function whenDoctestsFinish(cb) {
    // It doesn't seem like doctest.js can notify clients when
    // the tests are finished running, so we'll have to
    // poll for now.
    var intervalID = setInterval(function() {
      var failed = $('#doctestOutput span.failed');
      if (failed.text().length) {
        clearInterval(intervalID);
        cb(parseInt(failed.text()));
      }
    }, 50);
  }

  loadChildCodeSnippets();
  doctest();

  whenDoctestsFinish(function(numFailed) {
    if (numFailed == 0) {
      $('span.doctest-example-code-line').each(function() {
        if ($(this).text() == 'wait();') {
          var prompt = $(this).prev('.doctest-example-prompt').get(0);
          var newline = prompt.previousSibling;

          // Not sure why $(newline).remove() doesn't work, so...
          newline.parentNode.removeChild(newline);

          $(this).parent().after('<div class="time-passes"><span>' +
                                 'Time passes\u2026</span></div>');
          $(this).add(prompt).remove();
        }
      });
      
      $('span.doctest-example-prompt').remove();
      $('span.doctest-example-code').syntaxHighlight('javascript');
    } else {
      $('#container .more-link').remove();
      $('.more').show();
    }

    $('#please-wait').fadeOut(function() {
      if (numFailed == 0)
        $("#all-tests-passed").fadeIn();
      else 
        $("#some-tests-failed, #doctestOutput").fadeIn();
    });
  });
});
