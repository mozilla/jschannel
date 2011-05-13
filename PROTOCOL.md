# JSChannel - The Protocol

This document describes the structure and semantics of messages sent by
jschannel.

## Notational Conventions

Throughout this document when documenting data structures both example
objects (in JSON) and schema are provided.  All schema are in
[Orderly](http://orderly-json.org/), which is a textual shorthand for
JSONSchema.

## Underlying Technologies

*JSChannel* is built on top of several technologies: **[cross document
messaging](http://dev.w3.org/html5/postmsg/#web-messaging)** provides
the raw mechanism to exchange messages between documents from within
the browser on the client side.  [JSON](http://json.org) gives us a
concise and convenient means of serializing data that can be
represented in JavaScript.  Finally,
*[JSON-RPC](http://json-rpc.org/)* provides a representation and set
of semantics for messages.  While jschannel as presented here does
not leverage JSON-RPC precisely, the protocol they leverage is heavily
influenced by JSON-RPC.

## "Wire Format" and Message Types

The jschannel protocol involves 5 different kinds of messages:

### Requests

Request messages are the query half of a query/response transaction.
All requests *must* conform to the following schema:

    object {
      integer id;
      string method;
      any params?;
      array { string; } callbacks?;
    };

An example request might look something like:

    {
      "id": 72650,
      "method": "search::run",
      "params": {
        "term": "open"
      },
      "callbacks": [
        "results"
      ]
    }

**id** is a unique integer selected by the endpoint who is sending the 
request.

**method** is a required method name, indicating which service or function
should be executed on the receiving end.

**params** can be any data that is possible to represent in JSON.  The
precise contents are method dependant and are documented in a
subsequent section of this document.

**callbacks**, like **params**, are method dependent. These are an array of
strings which name "callbacks" that can be invoked *during* the
execution of a method. That is, a recipient of a request may invoke any number
of callbacks before returning completing the invocation (by returning a result
or an error).

### Callback Invocations

Callback invocations can occur after requests, but before responses.
They invoke a "callback" named in the initial request message.  Any
number of callback messages may be sent before a response.  It is an
error to send a callback message after a response has been sent and
the recipient should drop the message and *may* emit an error.
Callback invocation messages *must* conform to the following schema:

    object {
      integer id;
      string callback;
      any params?;
    };

An example callback invocation looks like:

    {
      "id": 72650,
      "callback": "results",
      "params": [
        {
          "title": "I like to open cans of worms"
          "link": "http://somesi.te/432521232"
        },
        {
          "title": "The open web is eye-opening"
          "link": "http://somesi.te/878235425"
        }
      ]
    }

**id** the integer id from the request to which this callback
invocation is a response.

**callback** the string identifier of a callback to invoke.  The original request must have included this same string in its **callbacks** array.

**params** can be any data that is possible to represent in JSON.  The
precise contents are method dependent and are documented in a
subsequent section of this document.

### Error Responses

Error messages *may* be sent in response to any request that may not be fulfilled.
The presence of both an id and an error property uniquely identifies error messages,
which *must* conform to the following schema.

    object {
      integer id;
      string error;
      string message?;
    };

**id** the integer id from the request to which this error is a
response.

**error** a textual error code which may be both a visual hint to developers as well
as meaningful programatically.

### Responses

Responses are sent when the action (or method) specified in a request is complete.

    object {
      integer id;
      any result?;
    };

**id** the integer id from the request to which this messge is a response.

**result** can be any data that is possible to represent in JSON.  The
precise contents are method dependent and are documented in a
subsequent section of this document.

### Notifications

Notifications are different from the other 4 message types in that
they stand alone.  Notifications are not required to have any response
at the protocol level, and typically deliver information about asynchronous
events.  Notification messages must conform to the following schema:

    object {
      string method;
      any params?;
    };

**method** is a required method name, indicating the nature of the notification.

**params** can be any data that is possible to represent in JSON.  The
precise contents are method dependent and are documented in a
subsequent section of this document.

## Connection Setup

When a channel is first established the two endpoints become ready at different
times.  "Readiness" in this case is the act of establishing an event listener to
receive messages and setting up whatever application level structures are required
to handle messages.

To deal with this race condition, a simple application level handshake is employed.
Each endpoint must obey the following:

* Once ready, each endpoint should emit a "ping" notification.
* Upon receipt of a "ping" notification an endpoint should assume that the other
  endpoint is ready and return a "pong" notification.
* Upon receipt of a "pong" notification an endpoint should assume that the other
  endpoint is ready.

In the above set of rules a ping notification is simply a *notification* with method
name "__ready", and the string "ping" as its *param* value.  A "pong" notification is 
identical, but with "pong" as its *param* value.

The following is a typical message flow at message startup:

    >> { "method": "conduit::__ready", "params": "ping" }
    (message lost)
    << { "method": "conduit::__ready", "params": "ping" }
    >> { "method": "conduit::__ready", "params": "pong" }
    (application handshake complete)

## All About Message IDs

XXX

## Method names and scoping

XXX






