// get the id of this conduit:
var id = /=(\d+)$/.exec(window.location.href)[1];

var chan = Channel.build({window: window.parent, origin: "*", scope: id});

chan.bind("echo", function(trans, args) {
    return args;
});
