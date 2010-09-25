$(document).ready(function() {
    var channels = { };
    function numChannels(ready) {
        var count = 0;
        for (var k in channels) {
            if (channels.hasOwnProperty(k))
                if (!ready || channels[k].ready)
                    count++;
        }
        return count;
    }

    var chanId = 0;

    function addChannel(cb) {
        var id = String(chanId++);
        var iframe = $("<iframe/>")
            .height(0)
            .width(0)
            .css("left","-999px")
            .css("top","-999px")
            .css("display","none")
            .attr("src", "conduit.html?id=" + id)
            .attr("id", "childIFrame_" + id)
            .appendTo("body");

        // now wrap a chan around that bad boy.
        var c = Channel.build({
            window: document.getElementById("childIFrame_" + id).contentWindow,
            origin: "*",
            scope: id,
            onReady: function () {
                channels[id].ready = true;
                cb(id);
            }
        });
        channels[id] = { chan: c, ready: false };
    }

    function log(msg) {
        var n = $("#outputArea");
        n.text(n.text() + msg + "\r\n");
    }

    $("#buildForm > button").click(function(e) {
        var startTime = new Date();
        var num = parseInt($.trim($("#buildForm input").val()));
        log("Adding " + num + " channels to " + numChannels() + " existing");
        var expectedTotal = num + numChannels();
        for (var i = 0; i < num; i++) {
            addChannel(function(id) {
                var count = numChannels(true);
                if (count == expectedTotal) {
                    var elapsed = ((new Date() - startTime) / 1000.0).toFixed(2);
                    log(num + " new channels added in " + elapsed + "s");
                    log("Total channels now: " + numChannels());
                }
            });
        }
        e.preventDefault();
    });

    $("#queryForm button").click(function(e) {
        e.preventDefault();
        var startTime = new Date();
        log("Querying " + numChannels() + " channels");
        var expectedTotal = numChannels();
        var gotResponses = 0;
        for (var k in channels) {
            channels[k].chan.call({ method:"echo", params:"foo", success: function(r) {
                if (r === "foo") {
                    if (++gotResponses === expectedTotal) {
                        var elapsed = ((new Date() - startTime) / 1000.0).toFixed(2);
                        log(gotResponses + " channel queried in " + elapsed + "s");
                    }
                }
            }});
        }
    });
});