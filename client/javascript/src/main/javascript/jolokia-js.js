/* LICENSE

This is the license for the Jolokia JavaScript client.

Copyright 2010 Stephan G. Beal (http://wanderinghorse.net/home/stephan)
and Dr. Roland Huss (roland@jolokia.org)

Licensed under the Apache License, Version 2.0 (the "License"); you
may not use this file except in compliance with the License.  You may
obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
implied.  See the License for the specific language governing
permissions and limitations under the License.
   
For purposes of the license, the term "Source" includes
documentation and demonstration source code which accompanies this
software. ("Accompanies" = is contained in the Software's primary
public source code repository.)

*/

/**
   JolokiaJS is a JavaScript client implementation of the Jolokia
   (a derivative of JMX4Perl (a.k.a. j4p)) request/response messaging
   system. It provides an OO interface with which one may send requests
   to JMX beans via the Jolokia agent running on a back-end application
   server. For most JS environments, this code must be served from the
   same server as Jolokia, due to the restrictions of the Same Origin Policy
   imposed by browsers.

   Author: Stephan Beal (http://wanderinghorse.net/home/stephan)

   Based heavily on code from the JSONMessage project
   (http://code.google.com/p/jsonmessage), refactored to support
   the Jolokia messaging conventions.

   Jolokia home page:

   http://www.jolokia.org

   (or google for "jmx4perl")

   Example:

   var req = new JolokiaJS.Request({
        type:'read',
        mbean:'java.lang:type=Memory'
    });
    req.post({
        onSuccess:function(resp,req){
            var val = resp.value();
            ... do something with val ...
        },
        onError:function(req,options){
            alert("ERROR:\n"+JSON.stringify(options,undefined,4));
        }
    });

    For the Request and Response classes, all Jolokia-defined message
    properties are available via FUNCTIONS (as opposed to properties).
    e.g. the "status" field is availble via myResponse.status().
*/
JolokiaJS = {
};

/**
    Generic options intended for use internally within JolokiaJS.
*/
JolokiaJS.options = {
    /**
        Used internally in some places as the 3rd argument to
        JSON.stringify() for JolokiaJS objects. Set it to null to
        disable extra spacing.
    */
    toJSONSpacing:'  '
};

/**
    Returns a function which behaves like this:

    If called with no arguments, it returns: this.get(key)

    Else it returns this.set( key, arguments[0] ).

    It it intended to generate accessors for methods for
    common fields in JolokiaJS objects.
*/
JolokiaJS.generateAccessor = function(key)
{
    return function()
    {
        return arguments.length
            ? (this.set( key, arguments[0] ))
            : this.get(key);

    };
};

/**
    Similar to JolokiaJS.generateAccessor(), but
    returns a function which operates on properties
    which are conventionally object literals.

    The returns function can be used like so:

        func(): returns this.get(PropKey).

        func(oneArg): returns this.set(PropKey,oneArg)
        (i.e. returns this object).

        func(k,v): Calls this.set(k,v).
        Returns this object.

        func(boolean replaceobj, Object obj):
        if replaceobj===true then the effect
        is the same as calling this.set(PropKey,obj).
        If replaceobj===false then
        each property of obj is deeply copied into
        the object returned by func() (the objectis created if
        needed).
        Returns this object.
*/
JolokiaJS.generateObjAccessor = function(PropKey)
{
    var key = PropKey;
    return function()
    {
        if( 1 < arguments.length )
        {
            var p = this.get(key);
            if( ! p ) this.set(key, p = {} ) /* remember that JolokiaJS.set() deeply copies! */;
            var a1 = arguments[0];
            if( (true===a1) || (false===a1) )
            {
                var obj = arguments[1];
                if( a1 === true ) this.set(key,obj);
                else
                {
                    for( var k in obj )
                    {
                        p[k] = obj[k];
                    }
                    this.set(key, p )
                        /* ^^^ i hate this - it's horribly inefficient
                        b/c of the to/from JSON of arbitrary other
                        properties, aside from those we just
                        updated.*/
                    ;
                }
            }
            else
            {
                p[ a1 ] = arguments[1];
                this.set(key, p ) /* see notes above. */;
            }
            return this;
        }
        else
        {
            return arguments.length
                ? (this.set( key, arguments[0] ))
                : this.get(key);
        }
    };
};


/**
    Returns true if v is-a Array.
*/
JolokiaJS.isArray = function( v )
{
    return (v &&
            (v instanceof Array) || (toString.call(v) === "[object Array]")
            );
    /* Reminders to self:
        typeof [] == "object"
        toString.call([]) == "[object Array]"
        ([]).toString() == empty
    */
};
/** Utility to return true if obj is-a function. */
JolokiaJS.isFunction = function(obj)
{
    return obj
    && (
    (obj instanceof Function)
    || ("[object Function]" === Object.prototype.toString.call(obj))
    )
    ;
}

/**
    A class for holding, manipulating, and posting Jolokia requests.

    If passed an argument, the argument must be a simple
    object containing a Jolokia-formatted request, or
    a JSON string of such an object. If the argument is malformed
    then this function might throw an exception. Optionally,
    the value may be empty/false/null/undefined, in which case
    it is ignored.
*/
JolokiaJS.Request = function() {
    this.$d = {
        fields:{}
    };
    if( arguments.length && arguments[0]) {
        this.fromJ4P(arguments[0]);
    }
};

/**
    Holds various class-level default configuration values.
*/
JolokiaJS.Request.options = {
    /**
        Holds class-level AJAX-related configuration options for the Request class.
    */
    ajax:{
        /**
            URL of the remote Jolokia agent. Normally (when running in a browser) the
            agent must be served from the same origin server as the JolokiaJS (or else
            JolokiaJS will not be able to establish a connection due to the Same Origin
            Policy).
        */
        url:'/jolokia/',
        /**
            Default timeout (in milliseconds) for message-sending requests. It is not
            guaranteed to be honored by any given back-end.
        */
        timeout:15000,
        /**
            The default HTTP method to use for message requests. Must be one of
            "GET" or "POST" (case-sensitive), and POST is highly recommended.
        */
        method:'POST',
        /**
            Optional HTTP-level user name for login purposes. Not supported by
            all back-ends.
        */
        loginName:undefined,
        /**
            Optional HTTP-level user password for login purposes. Not supported by
            all back-ends.
        */
        loginPassword:undefined,
        /**
            Default synchronicity mode. Not all backends support both async and synchronous
            operation, and may ignore this setting.
        */
        asynchronous:true,
        /**
            The callback called by the message-passing back-end when a response is received with a status
            code of 200. It is passed the response object and the originating request. The originating
            request is also available via response.request(), so this argument may be omitted from
            client implementations.
        */
        onSuccess:function(response,request) {
        },
        /**
            The callback called by the message-passing back-end when either
            a request connection cannot be established (e.g. wrong URL) or the response
            returns a non-200 status code.
            
            The connectionOpts object is a superset of the connection-level options passed
            to request.post(), request.postOptions(), and the values set in JolokiaJS.Request.options.ajax.
            post() implementations should set the property connectionOpts.errorMessage before
            calling this, to pass on any error text to the client.
        */
        onError:function(request,connectionOpts) {
            alert("JolokiaJS.Request.options.onError():\n"
                  +JSON.stringify(connectionOpts,undefined,4));
        },
        /**
            An optional callack called by Request.post() before a request is sent.
            If this callback throws, no request is sent and the onError() callback is
            NOT called. If this function returns an instance of JolokiaJS.Response then
            no request is actually posted and the given Response object is used in
            place of one we would have fetched via the network request. For all further
            processing purposes, the response will be treated as if it came in over the
            network. e.g. it will be passed to the onSuccess() callack if it has a status
            code of 200.
            
            This function can be used to start a "waiting..." animation, for example.
        */
        beforePost: function(request, connectOpt)
        {
        },
        /**
            This callback is called after a post()'s network connection has been processed,
            but before the onSuccess()/onError() callback is called.

            This function can be used to stop a "waiting..." animation, for example, which
            gets started via the beforePost() callback.
            
            FIXME: make sure we have well-defined rules about whether or not the
            onError() handler will be called if this function throws.
        */
        afterPost: function(request, connectOpt)
        {
        }
    }
};

/**
    INCOMPLETE - do not use.

   Returns the path part of a Jolokia request for use when
   using HTTP GET. The returned value is dependent on the
   request's type and does NOT have a leading slash.

   Sample return value:

   "read/java.lang:type=Memory/HeapMemoryUsage/used"
*/
JolokiaJS.Request.prototype.toHttpGETPath = function() {
    var type = this.type();
    if( /READ/i.test(type)) {
        return request.type()+"/"
               request.mbean()+"/"
               request.attribute()
               ;
    }
    else {
        throw new Error("Unhandled type() ["+type+"] for GET args!");
    }

};

/**
    Internal routine which tries to add the given XMLHttpRequest
    object to the firebug API. That said, the firebug XHR API has apparently
    changed considerably since this function was written, and this function
    currently only handles very old versions (test with firebug lite 1.2).
*/
JolokiaJS.Request.tryFirebug = function(xhr) {
    if( ('undefined'!==(typeof window)) && ('firebug' in window) && ('watchXHR' in window.firebug) )
    { /* plug in to firebug lite's XHR monitor... */
        window.firebug.watchXHR( xhr );
        return;
    }
    else if( 'undefined' !== typeof Firebug) {
        
    }

};

/**
    Common implementations of low-level Request.post() functions,
    all of which are independent on the concrete post() implementation.
    Such implementations are encouraged to use these functions, as they
    take care of enforcing certain framework-level conventions
    such as the calling of onSuccess()/onError() callbacks.
*/
JolokiaJS.Request.postImpl = {
    /**
        A helper function for concrete implementations
        of JolokiaJS.Request.prototype.postBackend(). This function
        does the generic processing needed for converting
        a JSON response to-a JolokiaJS.Response.

        - request must be the JolokiaJS.Request object which initiated
        request.

        - data must be the JSON-string result data from the request
        or a JSON object created from such a string, or a propertly-constructed
        JolokiaJS.Response object. Results are undefined if data is-a JolokiaJS.Response and
        JolokiaJS.Response was not constructed for (in response to) the given request.

        - opt must be the options object used to construct the request,
        i.e. the return value from JolokiaJS.Request.postImpl.normalizePostParameters().
        If opt.onSuccess is-a function then it is called as
        opt.onSuccess(JolokiaJS.Request,JolokiaJS.Response) it is called
        after the Response object is created.

        If opt.afterPost is a function then it is called with (request,opt)
        and any exceptions it throws are ignored.

        Since this function is run asynchronously, its return value
        is largely irrelevant. But... it returns a false value
        (not neccesarily a Boolean) on error, or it propagates an
        exception.

        This implementation does not require that this function
        be bound to a JolokiaJS.Request object. That it, it can be
        called without a JolokiaJS.Request 'this' object.

        Returns true on success, but its return value is normally
        illrelevant because it's called asynchronously.
    */
    onPostSuccess:function(request,data,opt)
    {
        //alert("got:\n"+data); return;
        if( !(request instanceof JolokiaJS.Request) )
        {
            throw new Error("JolokiaJS.Request.postImpl.onPostSuccess() requires that the first "
                            +"argument be-a JolokiaJS.Request! Got: "+typeof request);
        }
        if( ! data )
        {
            opt.errorMessage = "JolokiaJS.Request::post() succeeded but returned no data!";
            if( JolokiaJS.isFunction(opt.onError) )
            {
                opt.onError( request, opt );
            }
            return false;
        }
        else
        {
            if( JolokiaJS.isFunction(opt.afterPost) )
            {
                try
                {
                    opt.afterPost.apply( opt, [request,opt] );
                }
                catch(e){}
            }
            try
            {
                /**
                  Possible TODO: check if the response can be instantiated
                  by the factory, and if it can then instantiate it regardless
                  of whether onSuccess() is defined. This allows the constructors
                  to perform arbitrary logic without requiring that onSuccess()
                  be set.
                */
                if( JolokiaJS.isFunction( opt.onSuccess  ) )
                {
                    //alert( typeof data+" "+status+" "+data );
                    var resp = (data instanceof JolokiaJS.Response)
                      ? data
                      : new JolokiaJS.Response(data)
                      ;
                    /**
                      If the ctor throws then the onError() callback will end up being called,
                      which (slightly) violates the API docs which say that onError() is never
                      called in combination with onSuccess() unless onSuccess() throws.
                      Since we only construct just before calling onSuccess(), we can justify
                      this as being "part of the onSuccess() call." Sounds good to me.
                    */
                    resp.request(request)
                    /*ARGUABLE, b/c we MIGHT conflict with the JSON
                      data, e.g. case differences. However, i discussed this behaviour briefly
                      with Roland Huss (Jolokia author) and he agreed that giving the original
                      request object back is the right thing to do here.
                    */
                    if( "200" != ""+resp.status() )
                    {
                        if( JolokiaJS.isFunction( opt.onError  ) )
                        {
                            opt.onError( request, opt );
                        }
                    }
                    else {
                        opt.onSuccess( resp, request );
                    }
                }
                return true;
            }
            catch(e)
            {
                opt.errorMessage = "JolokiaJS.Request::post(): exception while handling inbound JolokiaJS.Response:\n"
                    + e
                    +"\nOriginal response data:\n"+(('object'===typeof data) ? JSON.stringify(data) : data)
                    ;
                ;
                if( JolokiaJS.isFunction(opt.onError) )
                {
                    opt.onError( request, opt );
                }
                return false;
            }
        }
    },
    /**
        The counterpart of JolokiaJS.Request.postImpl.onPostSuccess(), this
        is a general purpose on-error helper for concrete
        JolokiaJS.Request.prototype.postBackend() implementations.

        The arguments:

        - request should be the JolokiaJS.Request object which triggered the
        error.

        - opt must be the options object used to construct the request
        (e.g. the return value from JolokiaJS.Request.postImpl.normalizePostParameters()).
        The property opt.errorMessage should be set (by the caller) to
        a descriptive error message or an Error object describing the error.

        - If opt.afterPost is a function then it is called with (request,opt)
        and any exceptions it throws are ignored.

        - If opt.onError is-a Function then it is called as
        opt.onError(request,opt), and opt.errorMessage will contain
        a string or Error object describing why the onError() handler
        was called. (It is up to the caller of this function to set
        opt.errorMessage!)

        Note that this handler does not have anything to do with valid
        responses which themselves contain a non-zero error code. It only
        has to do with the AJAX call itself, and should be used only
        to report such failures. This is, if the server actually responds
        with a Message result, even if that Message represents an error,
        this function should not be called. The exception is if the
        onSuccess() call throws an exception - if it does, the onError()
        handler will be called and passed the error (as a string) via
        opt.errorMessage.

        This implementation does not require that this function
        be bound to a JolokiaJS.Request object. That it, it can be
        called without a JolokiaJS.Request 'this' object.

        If the opt.onError() callback throws/propagates an exception,
        that exception is silently ignored.

        TODO: consider propagating exceptions when posting in
        synchronous mode, but not all AJAX backends currently
        support synchronous mode (or do not document it).
    */
    onPostError: function(request,opt)
    {
        if( JolokiaJS.isFunction(opt.afterPost) )
        {
            try
            {
                opt.afterPost.apply( opt, [request,opt] );
            }
            catch(e){}
        }
        try
        {
            if( JolokiaJS.isFunction( opt.onError ) )
            {
                opt.onError( request, opt );
            }
        } catch(e) {/*ignore*/}
    },
    /**
    An internal helper function for concrete JolokiaJS.Request.post()
    implementations. This function returns an object in the form:

    {
    url:XXX, // XXX==see below
    onSuccess:YYY, // YYY=see below

    ... other properties defined in JolokiaJS.Request.options.ajax ...
    }

    Where XXX and YYY depend on the arguments passed to this function...

    It should be passed a properties object.

    Here are the supported arguments:

    args = () = {superset of this.postOptions() and JolokiaJS.Request.options.ajax)}

    args = {...properties object: see below ...}

    If the argument is a properties object, all properties from that object
    are copied (shallowly) into the returned object.

    Any properties which are in this.postOptions() or in
    JolokiaJS.Request.options.ajax but are not set by other arguments to
    this function will be set to the values from this.postOptions()
    or JolokiaJS.Request.options.ajax (in that order, using the first
    one found). Thus the returned object will have all properties
    it needs for a post() to continue (unless of course the input objects
    are set up incorrectly).

    What all this means is: it supports the arguments conventions required
    by the JolokiaJS.Request.post() interface, and returns the arguments in a
    normalized form which all API-conformant concrete implementations of
    JolokiaJS.Request.prototype.postBackend() can (and should) use for their arguments
    handling.

    ACHTUNG:

    This function must be called in the context of a JolokiaJS.Request object.
    i.e. the 'this' pointer must be the JolokiaJS.Request on whos behalf this
    function is operating. Because this function relies on arguments.length,
    when it is used for its intended purpose it should be called like:

    @code
    var av = Array.prototype.slice.apply( arguments, [0] );
    var args = JolokiaJS.Request.postImpl.normalizePostParameters.apply( this, av );
    // (assuming 'this' is-a JolokiaJS.Request object) ------->^^^^
    @endcode

    instead of passing arguments (possibly with undefined values) directly to
    this function.

    To avoid cross-message pollenation, this function deeply copies any
    properties which are themselves non-function objects (by cloning them
    via JSON).
    */
    normalizePostParameters: function (options)
    {
        if( ! (this instanceof JolokiaJS.Request ) )
        {
            throw new Error("JolokiaJS.Request.postImpl.normalizePostParameters() requires that it be "
                            +"called with a JolokiaJS.Request object as its 'this' pointer!");
        }
        var rc = {};
        var i;
        var obj = options;
        for( i in obj )
        {
            rc[i] = obj[i];
        }
        var combo = {};
        function append(k,v)
        {
            if( JolokiaJS.isFunction(v) ) {}
            else if( 'object' === typeof v ) v = JSON.parse( JSON.stringify(v) );
            combo[k]=v;
        }
        for( i in JolokiaJS.Request.options.ajax ) append(i,JolokiaJS.Request.options.ajax[i]);
        var popt = this.postOptions();
        for( i in popt ) append(i,popt[i]);
        for( i in combo )
        {
            if( undefined === rc[i] ) rc[i] = combo[i];
        }
        return rc;
    },
    concrete:{
        /**
            This is a concrete implementation of JolokiaJS.Request.prototype.postBackend()
            which uses a "raw" XMLHttpRequest request, rather than a higher-level
            API from a 3rd-party AJAX library.

            If window.firebug is set then window.firebug.watchXHR() is called
            to enable monitoring of the XMLHttpRequest object.

            The only argument must be a connection properties object, as constructed
            by JolokiaJS.Request.normalizePostParameters().

            See JolokiaJS.Request.prototype.post() for the documentation regarding
            the options object.

            Returns the XMLHttpRequest object.

            This implementations honors the loginName and loginPassword connection
            parameters.

            This implementation supports for the connection timeout option but does not
            support synchronous operation.

            This implementation requires that the 'this' object be-a JolokiaJS.Request OR
            that the request parameter be a JolokiaJS.Request object.
            In the former case the second argument need not be passed in.
        */
        XMLHttpRequest: function(args,request)
        {
            if( args.method != "POST") {
                throw new Error("Only POST requests are currently implemented!");
            }
            var json = this.toJ4PString();
            request = request || this;
            var xhr = new XMLHttpRequest();
            var hitTimeout = false;
            var done = false;
            var tmid /* setTimeout() ID */;
            function handleTimeout()
            {
                hitTimeout = true;
                if( ! done )
                {
                    var now = (new Date()).getTime();
                    try { xhr.abort(); } catch(e) {/*ignore*/}
                    // see: http://www.w3.org/TR/XMLHttpRequest/#the-abort-method
                    args.errorMessage = "Timeout of "+timeout+"ms reached after "+(now-startTime)+"ms during AJAX request.";
                    JolokiaJS.Request.postImpl.onPostError( request, args );
                }
                return;
            }
            function onStateChange()
            { // reminder to self: apparently 'this' is-not-a XHR :/
                if( hitTimeout )
                { /* we're too late - the error was already triggered. */
                    return;
                }

                if( 4 == xhr.readyState )
                {
                    done = true;
                    if( tmid )
                    {
                        clearTimeout( tmid );
                        tmid = null;
                    }
                    if( (xhr.status >= 200) && (xhr.status < 300) )
                    {
                        JolokiaJS.Request.postImpl.onPostSuccess( request, xhr.responseText, args );
                        return;
                    }
                    else
                    {
                        if( undefined === args.errorMessage )
                        {
                            args.errorMessage = "Error sending a '"+args.method+"' AJAX request to "
                                    +"["+args.url+"]: "
                                    +"Status text=["+xhr.statusText+"]"
                                ;
                        }
                        else { /*maybe it was was set by the timeout handler. */ }
                        JolokiaJS.Request.postImpl.onPostError( request, args );
                        return;
                    }
                }
            };

            xhr.onreadystatechange = onStateChange;
            JolokiaJS.Request.tryFirebug(xhr);
            var startTime = (new Date()).getTime();
            var timeout = args.timeout || 10000/*arbitrary!*/;
            try
            {
                function xhrOpen()
                {
                    if( 'loginName' in args )
                    {
                        xhr.open( args.method, args.url, args.asynchronous, args.loginName, args.loginPassword );
                    }
                    else
                    {
                        xhr.open( args.method, args.url, args.asynchronous  );
                    }
                }
                if( 'POST' ===  args.method.toUpperCase() )
                {
                    xhrOpen();
                    xhr.setRequestHeader("Content-Type", "text/plain");
                    xhr.setRequestHeader("Content-length", json.length);
                    xhr.setRequestHeader("Connection", "close");
                    xhr.send( json );
                }
                else /* assume GET */
                {
                    var u = /\/$/.test(args.url) ? args.url : "/"+args.url
                        + request.toHttpGETPath();
                    args.url = u;
                    xhrOpen();
                    xhr.send(null);
                }
                tmid = setTimeout( handleTimeout, timeout );
                return xhr;
            }
            catch(e)
            {
                args.errorMessage = e.toString();
                JolokiaJS.Request.postImpl.onPostError( request, args );
                return undefined;
            }
        }/*XMLHttpRequest*/,
        /**
            This is a concrete implementation of JolokiaJS.Request.prototype.post()
            which uses the jQuery AJAX API to send a message request and fetch
            the response.

            The only argument must be a connection properties object, as constructed
            by JolokiaJS.Request.normalizePostParameters().

            If window.firebug is set then window.firebug.watchXHR() is called
            to enable monitoring of the XMLHttpRequest object.

            This implementations honors the loginName and loginPassword connection
            parameters.

            Returns the XMLHttpRequest object.

            This implementation requires that the 'this' object be-a JolokiaJS.Request OR
            that the request parameter be a JolokiaJS.Request object.
            In the former case the second argument need not be passed in.
        */
        jQuery:function(args,request)
        {
            if( args.method != "POST") {
                throw new Error("Only POST requests are currently implemented!");
            }
            request = request || this;
            var data = request.toJ4PString();
            var method = args.method;
            var ajopt =
            {
                url: args.url,
                data:data,
                type: args.method,
                async: args.asynchronous,
                password: (undefined !== args.loginPassword) ? args.loginPassword : undefined,
                username: (undefined !== args.loginName) ? args.loginName : undefined,
                error: function(xhr, textStatus, errorThrown)
                {
                    //reminder: this === the options for this ajax request
                    args.errorMessage = "Error sending a '"+ajopt.type+"' JolokiaJS.Request to ["+ajopt.url+"]: "
                            +"Status text=["+textStatus+"]"
                            +(errorThrown ? ("Error=["+errorThrown+"]") : "")
                        ;
                    JolokiaJS.Request.postImpl.onPostError( request, args );
                },
                success: function(data)
                {
                    JolokiaJS.Request.postImpl.onPostSuccess( request, data, args );
                },
                dataType: 'json'
            };
            if( undefined !== args.timeout )
            {
                ajopt.timeout = args.timeout;
            }
            try
            {
                var xhr = jQuery.ajax(ajopt);
                if( xhr ) JolokiaJS.Request.tryFirebug(xhr);
                return xhr;
            }
            catch(e)
            {
                args.errorMessage = e.toString();
                JolokiaJS.Request.postImpl.onPostError(request, args);
                return undefined;
            }
        }/*jQuery*/
    }/*concrete*/
};


/**
    Returns an object holding this object's state in a JSONizable form.
    The structure is that defined by the Jolokia/j4p protocol. The object
    is a shallow copy, so do not unduly modify it. To deeply clone it, JSONize
    it.
*/
JolokiaJS.Request.prototype.toJ4PObj = function() {
    return {
        type:this.type(),
        mbean:this.mbean(),
        attribute:this.attribute(),
        path:this.path(),
        value:this.value(),
        'arguments':this.arguments(),
        operation:this.operation()
    };
}

/**
    Equivalent to JSON.stringify(this.toJ4PObj(),undefined,indentation).
*/
JolokiaJS.Request.prototype.toJ4PString = function(indentation) {
    return JSON.stringify(this.toJ4PObj(),undefined,indentation);
}

/**
    Equivalent to this.toJ4PString(indentation). Provided because
    JSON.stringify() looks for this function.
*/
JolokiaJS.Request.prototype.toJSON = function(indentation) {
    return this.toJ4PString(indentation);
};

/**
    Populates this object from the given json string or object
    which contains Jolokia-format Response data. If the argument is malformed
    then this function might throw an exception.

    This function clears all Jolokia-level request state but does not
    clear any postOptions() which have been set on this object,
    nor any custom properties set by the client.
*/
JolokiaJS.Request.prototype.fromJ4P = function(json) {
    var obj = ((json instanceof String) || ('string' === typeof json))
        ? JSON.parse(json)
        : json;
    this.$d.fields = {};
    this.type(obj.type);
    this.mbean(obj.mbean);
    this.attribute(obj.attribute);
    this.path(obj.path);
    this.value(obj.value);
    this.arguments(obj.arguments);
    this.operation(obj.operation);
    return this;
};

/**
    Sets a key/value pair in the message's core properties.

    This is intended to be bound as a member function
    of the JolokiaJS.Request and JolokiaJS.Response classes.

    If k is-a Array or Object then it is assumed to be a
    collection of key/val pairs and those pairs are
    _copied_ to this object (and v is ignored).

    All values set by this function are DEEPLY COPIED by
    first JSON-ing them and then un-JSON-ing them.
    This is done to ensure that a) there are no
    cycles which would break the message later on
    and b) to ensure that external changes to the
    data via its original reference do not change
    the values set in this object.

    Be aware that the deep-copy process (JSON serialization)
    elides any entries not supposed by JSON.stringify(), e.g.
    functions.

    Returns this object.

    ACHTUNG: k will be used as an object property
    key, and therefore should follow JavaScript identifier
    naming rules. That said, JSON allows us to use arbitrary
    key strings, e.g. "foo/bar", which aren't legal identifiers,
    so feel free to use such strings.
*/
JolokiaJS.setterImpl = function(k,v)
{
    if( ! k ) return this; // kludge to avoid a phantom '0' entry
    if( JolokiaJS.isArray( k ) || ('object' === typeof k))
    {
        for( var i in k )
        {
            this.set( i, k[i] );
        }
    }
    else
    {
        try {
            this.$d.fields[k] = (undefined !== v)
                ? JSON.parse( JSON.stringify( v ) )
                : v;
        }
        catch(e) {
            alert("ERROR SET()ing FIELD ["+k+"]:\n"+e);
        }
    }
    return this;
};
/** Returns the value of message core field k.

    This is intended to be bound as a member function
    of the JolokiaJS.Request and JolokiaJS.Response classes.
*/
JolokiaJS.getterImpl = function(k)
{
    return this.$d.fields[k];
}
/**
    See JolokiaJS.setterImpl().
*/
JolokiaJS.Request.prototype.set = JolokiaJS.setterImpl;
/**
    See JolokiaJS.getterImpl().
*/
JolokiaJS.Request.prototype.get = JolokiaJS.getterImpl;
/** Gets or sets the 'type' request field. See JolokiaJS.getterImpl(). */
JolokiaJS.Request.prototype.type = JolokiaJS.generateAccessor('type');
/** Gets or sets the 'mbean' request field. See JolokiaJS.getterImpl(). */
JolokiaJS.Request.prototype.mbean = JolokiaJS.generateAccessor('mbean');
/** Gets or sets the 'attribute' request field. See JolokiaJS.getterImpl(). */
JolokiaJS.Request.prototype.attribute = JolokiaJS.generateAccessor('attribute');
/** Gets or sets the 'path' request field. See JolokiaJS.getterImpl(). */
JolokiaJS.Request.prototype.path = JolokiaJS.generateAccessor('path');
/** Gets or sets the 'value' request field. See JolokiaJS.getterImpl(). */
JolokiaJS.Request.prototype.value = JolokiaJS.generateAccessor('value');
/** Gets or sets the 'arguments' request field. See JolokiaJS.getterImpl(). */
JolokiaJS.Request.prototype.arguments = JolokiaJS.generateAccessor('arguments');
/** Gets or sets the 'operation' request field. See JolokiaJS.getterImpl(). */
JolokiaJS.Request.prototype.operation = JolokiaJS.generateAccessor('operation');

/**
    The core implementation of the post() operation, which sends a Jolokia
    request to the back-end.

    postOpt is an optional options object. These specify the connection-level
    options, as opposed to j4p/Jolokia-level options. It may contain any key/value pairs
    specified in the JolokiaJS.Request.options.ajax object. Any options which are not specified
    here are inherited from postOptions() or (if none are set there) from
    JolokiaJS.Request.options.ajax.
*/
JolokiaJS.Request.prototype.post = function(postOpt) {
        if( !JolokiaJS.isFunction(this.postBackend) )
        {
            throw new Error("This object has no postBackend() member function! I don't know how to send the request!");
        }
        var ex;
        var rc;
        var av = Array.prototype.slice.apply( arguments, [0] );
        var norm = JolokiaJS.Request.postImpl.normalizePostParameters.apply( this, av );
//        try {
            var pre;
            if( JolokiaJS.isFunction(norm.beforePost) )
            {
                pre = norm.beforePost.apply( norm, [this,norm] );
                ranBeforePost = true;
                if( pre instanceof JolokiaJS.Response )
                {
                    pre.request(this);
                    JolokiaJS.Request.postImpl.onPostSuccess( this, pre, norm );
                    return;
                }
            }
            rc = this.postBackend( norm );
            // possibly ^^^^^ corner case: if that throws, afterPost() might or might not be called?
//        }
//        catch(e) {
//            rc = undefined;
//            ex = e;
//        }
//        if(ex) throw ex;
        return rc;
};

/*
    Gets or sets per-instance connection data in the form:

    {
      ... see the JolokiaJS.Request.options.ajax property list documentation ...
    }

    During post(), any options not set here and not passed to post()
    will be pulled from JolokiaJS.Request.options.ajax.

    Concrete implementations of JolokiaJS.Request.prototype.post()
    may allow or require that the properties object contain
    additional data, e.g. login credentials or some form of
    remote API login key.

    If called with no arguments it returns a reference to the current
    options object, which will not be null but may contain null/undefined
    values. When called with arguments (as a setter), this function returns
    _this_ object.

    If called with one argument, the argument is assumed to be
    an object as described above, and it completely replaces the
    contents of any existing options.

    If called like postOptions(false,obj), then any properties
    in obj are copied into the existing options, overwriting
    any pre-existing properties. Note that this form requires
    a literal false value, and not any old false boolean value.
    If called like postOptions(non-false,obj), the effect is the
    same as calling postOptions(obj).

    These options, if set, are used as defaults by JolokiaJS.Request.post().
    Null/undefined values mean that the class-wide defaults
    will be used when post() is called (assuming the post() caller
    does not pass them to post(), in which case those values
    take precedence).

    Important notes:

    - If passing options to multiple request objects, be certain
    to give each request its own copy of the object/property, as
    opposed to giving them all a handle to the same properties object.
    If multiple requests get the same object, then changes to one
    will affect the other requests. Then again, maybe that's what
    you want. We do not deeply copy the options in this routine
    because the options object needs to be able to hold functions
    and we cannot JSON those (which is otherwise an easy method
    to deeply copy objects).
*/
JolokiaJS.Request.prototype.postOptions = function(obj)
{
    /**
        i would REALLY rather create/return deep copies
        of the objects, mainly to avoid cross-polenization
        of props between unrelated messages, but...

        using JSON.parse( JSON.stringify(obj) ) to do the deep
        copy (i.e., the easy way) will fail for Function members,
        and we want to support obj.onSuccess() and obj.onError().
    */
    if( undefined === this.$d.postOpt )
    {
        this.$d.postOpt = {};
    }
    if( ! arguments.length )
    {
        return this.$d.postOpt;
    }
    else {
        if( (false === arguments[0]) )
        {
            obj = arguments[1];
            var i;
            if(obj) for( i in obj )
            {
                this.$d.postOpt[i] = obj[i];
            }
        }
        else
        {
            this.$d.postOpt = obj;
        }
        return this;
    }
};


/**
    JolokiaJS.Request.prototype.postBackend must point to a function
    which complies with the post() interface. Different implementations
    exist for different AJAX back-ends.
*/
JolokiaJS.Request.prototype.postBackend =
    JolokiaJS.Request.postImpl.concrete.XMLHttpRequest
    //JolokiaJS.Request.postImpl.concrete.jQuery
    ;

/**
    A class for holding Jolokia response data.

    If passed an argument, the argument must be a simple
    object containing a Jolokia-formatted response, or
    a JSON string of such an object.
*/
JolokiaJS.Response = function() {
    this.$d = {
        fields:{}
    };
    if( arguments.length ) {
        this.fromJ4P(arguments[0]);
    }
};

/**
    See JolokiaJS.setterImpl().
*/
JolokiaJS.Response.prototype.set = JolokiaJS.setterImpl;
/** See JolokiaJS.getterImpl(). */
JolokiaJS.Response.prototype.get = JolokiaJS.getterImpl;
/** Gets or sets the 'value' request field. See JolokiaJS.getterImpl(). */
JolokiaJS.Response.prototype.value = JolokiaJS.generateAccessor('value');
/** Gets or sets the 'timestamp' request field. See JolokiaJS.getterImpl(). */
JolokiaJS.Response.prototype.timestamp = JolokiaJS.generateAccessor('timestamp');
/** Gets or sets the 'status' request field. See JolokiaJS.getterImpl(). */
JolokiaJS.Response.prototype.status = JolokiaJS.generateAccessor('status');
/** Gets or sets the 'error' request field. See JolokiaJS.getterImpl(). */
JolokiaJS.Response.prototype.error = JolokiaJS.generateAccessor('error');
/** Gets or sets the 'history' request field. See JolokiaJS.getterImpl(). */
JolokiaJS.Response.prototype.history = JolokiaJS.generateAccessor('history');
/** Gets or sets the 'stacktrace' request field. See JolokiaJS.getterImpl(). */
JolokiaJS.Response.prototype.stacktrace = JolokiaJS.generateAccessor('stacktrace');

/**
    If called with no arguments it returns this object's associated request
    (as a JolokiaJS.Request object).

    If passed an argument, it is assumed to be a JolokiaJS.Request
    or a JSON string or object suitable for passing to the
    JolokiaJS.Request constructor. In those cases it sets this
    object's associated request and returns this object. If the given
    argument is malformed, this function may throw an exception.
*/
JolokiaJS.Response.prototype.request = function(json) {
    if( 0 == arguments.length ) return this.$d.fields['request'];
    else {
        if(json instanceof JolokiaJS.Request) {
            this.$d.fields['request'] = json;
        }
        else {
            this.$d.fields['request'] = json ? new JolokiaJS.Request(json) : undefined;
        }
        return this;
    }
}
/**
    Requires a j4p/Jolokia-compliant string (JSON) representation
    of this object's state.
*/
JolokiaJS.Response.prototype.toJ4PString = function(indentation) {
    indentation = indentation || 0;
    var req = this.request();
    var obj = {
        value:this.value(),
        timestamp:this.timestamp(),
        status:this.status(),
        request:(req ? req. toJ4PObj() : undefined),
        history:this.history(),
        error:this.error(),
        stacktrace:this.stacktrace()
    };
    //alert(typeof obj.request);
    return JSON.stringify(obj,undefined,indentation);
}

/**
    The json parameter is assumed to be either a fully-populated
    simple object in the structure specified by the Jolokia Response
    protocol, or a JSON string of such an object. This function populates
    this object's state based on that structure.

    All Jolokia-level response data is cleared/reset by this function,
    but JolokiaJS-level properties are retained. That said, a Response
    currently has no JolokiaJS-level properties :/.
*/
JolokiaJS.Response.prototype.fromJ4P = function(json) {
    var obj = ((json instanceof String) || ('string' == typeof json))
        ? JSON.parse(json)
        : json;
    this.$d.fields = {};
    this.value(obj.value);
    this.timestamp(obj.timestamp);
    this.status(obj.status);
    this.error(obj.error);
    this.stacktrace(obj.stacktrace);
    this.request(obj.request);
    //alert(typeof this.request());
    return this;
}
