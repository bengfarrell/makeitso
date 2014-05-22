var EventEmitter = require('events').EventEmitter,
    util = require('util'),
    spawn = require('child_process').spawn,
    https = require('https');
    http = require('http');
    fs = require('fs');


var MakeItSo = function MakeItSo(options) {
    var self = this;

    /** are we recording now? */
    self._recRunning = false;

    /** final recording buffer array */
    self._recordBuffer = [];

    /** interim recording buffer array */
    self._interimRecordBuffer = [];

    /** speech commands */
    self._commands = [];

    /**
     * start recording
     */
    self.start = function() {
        if (!self.options.access_token && self.options.service == "att") {
            if (self.options.verbose) {
                console.log('Getting Access Token...');
            }
            self.getAccessToken(self.start);
        }
        self._rec = spawn(self.cmd, self.cmdArgs, 'pipe');
        self._rec.stdout.on('readable', self._onAudioReady);
        self._rec.stdout.setEncoding('binary');
        self._rec.stdout.on('data', self._onAudioData);
        self._rec.on('close', self._onAudioClose);

        if (self.options.verbose == true) {
            self._rec.stderr.setEncoding('utf8');
            self._rec.stderr.on('data', function(data) {
                console.log(data);
            });
        }

    }

    self.stop = function() {
        self._rec.kill();
    }

    /**
     * audio ready event
     * @private
     */
    self._onAudioReady = function() {
        self.emit('speechReady');
    }

    /**
     * on audio channel closed
     * @private
     */
    self._onAudioClose = function(err) {
        self._recRunning = false;
        if(err) {
            self.emit('error', 'sox exited with code ' + err);
        }
        self.emit('speechStop');
        self._sendAudio(self._recBuffer);
        self._recBuffer = [];
    }

    /**
     * audio data event stream
     * @param data
     * @private
     */
    self._onAudioData = function(data) {
        if(! self._recRunning) {
            self.emit('speechStart');
            self._recRunning = true;
        }

        self._recBuffer.push(data);

        /**
         if (self.options.useInterimResults) {
            self._interimRecordBuffer.push(data);
            if (self._interimRecordBuffer.length > self.options.interimBlockLength) {
                self._sendAudio(self._interimRecordBuffer);
                self._interimRecordBuffer = [];
            }
        }*/
    }

    /**
     * add command
     * @param word
     * @param command/function
     */
    this.addCommand = function(words, command) {
        if ( typeof(words) === "string" ) {
            words = [words];
        }
        self._commands.push( {"words": words, "command": command } );
    }

    /**
     * clear commands to listen for
     */
    this.clearCommands = function() {
        self._commands = [];
    }

    /**
     * send audio to the googles
     * @param buffer
     * @private
     */
    self._sendAudio = function(buffer) {
        if (buffer.length == 0) { return; }

        var opts = self._constructHeader(self.options.service);

        var service = http;
        if (self.options.service == "att") { service = https; }
        var req = service.request(opts, function(res) {
            var result;
            if(res.statusCode !== 200 && service == "google") {
                return self.emit(
                    'error',
                        'Non-200 answer Speech API (' + res.statusCode + ')'
                );
                if (self.options.continuous) {
                    self.start();
                }
            }
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                result = JSON.parse(chunk);
            });
            res.on('end', function () {
                self.emit('speechResult', self._parseResults(self.options.service, result));
                if (self.options.continuous) {
                    self.start();
                }
            });
        });

        req.on('error', function(e) {
            self.emit('error', e);
            if (self.options.continuous) {
                self.start();
            }
        });

        if (self.options.verbose) {
            console.log('Posting voice data...');
        }

        for(var i in buffer) {
            if(buffer.hasOwnProperty(i)) {
                req.write(new Buffer(buffer[i],'binary'));
            }
        }
        this._httpRequestInProgress = true;
        req.end();
    }

    /**
     * get access token for att service
     * @param callback
     */
    self.getAccessToken = function(callback) {
        // Set the params for the OAuth 2.0 Request
        var request_params = {
            client_id: self.options.att_client_id,
            client_secret: self.options.att_client_secret,
            grant_type: "client_credentials",
            scope: "SPEECH"
        };

        // Create the Param String
        var paramlist  = [];
        for (pk in request_params) {
            paramlist.push(pk + "=" + request_params[pk]);
        };
        var post_data = paramlist.join("&");

        // !Details of the OAuth 2.0 Request
        var opts = {
            method: "POST",
            headers: {'Accept': 'application/json', 'Content-type' : 'application/x-www-form-urlencoded'},
            host: "api.att.com",
            path: "/oauth/token",
        };
        // Set up the request
        var req = https.request(opts, function(res) {
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                self.options.access_token = JSON.parse(chunk)['access_token'];
                if (self.options.verbose) {
                    console.log('Recieved Access Token');
                }
                callback(JSON.parse(chunk)['access_token']);
            });
        });
        req.write(post_data);
        req.end();
    };

    self._init = function() {
        EventEmitter.call(this);
        self._applyConfig(options);
    }

    /**
     * parse results from diff services
     * @param service
     * @param result
     * @returns {*}
     * @private
     */
    self._parseResults = function(service, result) {
        var recognizedWords;
        if (service == "att") {
            try {
                recognizedWords = result.Recognition.NBest[0].Hypothesis;
            } catch  (e) {
                recognizedWords = "";
            }
        } else if (service == "google") {
            try {
                recognizedWords = result["result"][0]["alternative"][0]["transcript"];
            } catch (e) {
                recognizedWords = "";
            }
        }

        for (var command in self._commands) {
            for (var word in self._commands[command].words) {
                if (recognizedWords.toLowerCase().indexOf(self._commands[command].words[word].toLowerCase()) != -1) {
                    var w = self._commands[command].words[word];
                    var index = recognizedWords.indexOf(w);
                    var transcript = recognizedWords.substr(0, index) + recognizedWords.substr(index + w.length, recognizedWords.length);
                    self._commands[command].command.apply(self, [{ "word" : w, "transcript": recognizedWords }]);
                }
            }
        }

        return recognizedWords;
    }

    /**
     * construct header for service call
     * @param service
     * @returns {*}
     * @private
     */
    self._constructHeader = function(service) {
        if (service == "att") {
            return {
                hostname: 'api.att.com',
                path: '/speech/v3/speechToText',
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + self.options.access_token,
                    'Content-Type': 'audio/wav',
                    'Accept': 'application/json',
                    'Transfer-Encoding': 'chunked',
                    'Connection': 'keep-alive',
                    'X-SpeechContext': 'Generic'
                }
            };
        } else if (service == "google") {
            return {
                hostname: 'www.google.com',
                path: '/speech-api/v2/recognize?xjerr=1&client=chromium&pfilter=0&maxresults=1&key=' + self.options.google_key + '&lang=' + self.options.google_lang,
                method: 'POST',
                headers: {
                    'Content-type': 'audio/x-flac; rate=16000'
                }
            };
        }
    }

    self._applyConfig = function(options) {
        self.options = options || {}

        // set defaults
        if (!self.options.hasOwnProperty('verbose')) { self.options.verbose = false; }
        if (!self.options.bitdepth) { self.options.bitdepth = 16; }
        if (!self.options.rate) { self.options.rate = 16000; }
        if (!self.options.channels) { self.options.channels = 1; }
        if (!self.options.continuous) { self.options.continuous = false; }
        //if (!self.options.hasOwnProperty('useInterimResults')) { self.options.useInterimResults = true; }
        //if (!self.options.interimBlockLength) { self.options.interimBlockLength = 5; }
        if (!self.options.soxLocation) { self.options.soxLocation = __dirname + '/sox'; }
        if (!self.options.silenceTrimDurationStart) { self.options.silenceTrimDurationStart = 0.1; }
        if (!self.options.silenceTrimDurationEnd) { self.options.silenceTrimDurationEnd = 1.0; }
        if (!self.options.silenceTrimThresholdStart) { self.options.silenceTrimThresholdStart = '0.1%'; }
        if (!self.options.silenceTrimThresholdEnd) { self.options.silenceTrimThresholdEnd = '0.1%'; }
        if (!self.options.service) { self.options.service = "att"; }
        if (!self.options.att_client_id) { self.options.att_client_id = "need client ID"; }
        if (!self.options.att_client_secret) { self.options.att_client_secret = "need client secret"; }
        if (!self.options.google_key) { self.options.google_key = "need google_key"; }
        if (!self.options.google_lang) { self.options.google_lang = "en-US"; }

        self._recBuffer = [];
        self._recRunning = false;
        self._httpRequestInProgress = false;
        self.cmd = self.options.soxLocation;

        self.cmdArgs = [];

        // set bit depth
        self.cmdArgs.push('-b');
        self.cmdArgs.push(self.options.bitdepth);

        // use deafult device
        self.cmdArgs.push('-d');

        // set audio format
        self.cmdArgs.push('-t');

        if (self.options.service == "google") {
            self.cmdArgs.push('flac');
        } else if (self.options.service == "att") {
            self.cmdArgs.push('wav');
        }

        // set audio rate
        self.cmdArgs.push('-');
        self.cmdArgs.push('rate');
        self.cmdArgs.push(self.options.rate);

        // set number of channels
        self.cmdArgs.push('channels');
        self.cmdArgs.push(self.options.channels);

        // silence trimming
        // .tofixed because apparently 1 doesn't mean 1.0 in SOX speak (and it matters for some reason)
        self.cmdArgs.push('silence');
        self.cmdArgs.push(1);
        self.cmdArgs.push(self.options.silenceTrimDurationStart.toFixed(1).toString());
        self.cmdArgs.push(self.options.silenceTrimThresholdStart);
        self.cmdArgs.push(1);
        self.cmdArgs.push(self.options.silenceTrimDurationEnd.toFixed(1).toString());
        self.cmdArgs.push(self.options.silenceTrimThresholdEnd);

        if (self.options.verbose) {
            console.log("SOX Options: " + self.cmdArgs.join(", "));
        }
    }

    self._init();
}

util.inherits(MakeItSo, EventEmitter);
module.exports = MakeItSo;
