# What is this?

This is some exploration around the cost of channels.  How will they
scale when hundreds of them are loaded into the same page?  Here's are 
some intial questions:

1. How long does it take on an average machine to initialize 100
   channels?  This includes adding iframes to the dom and establishing
   communication with them.

2. How long would it take to execute a single query across all of
   those channels?

# Running

1. open index.html in your favorite modern browser
2. press buttons
