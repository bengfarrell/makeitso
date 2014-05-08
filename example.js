var MakeItSo = require('./lib/makeitso');

// Setup google speech
var opts = {
    soxLocation: "C:/Program Files (x86)/sox-14-4-1/sox",
    verbose: false,
    continuous: true,
    silenceTrimThresholdStart: '5%',
    silenceTrimThresholdEnd: '5%',
    service: "google",
    google_key: "AIzaSyCnl6MRydhw_5fLXIdASxkLJzcJh5iX0M4"
}

var makeitso = new MakeItSo(opts);

makeitso.on('speechStart', function() {
    // console.log('onSpeechStart');
});

makeitso.on('speechStop', function() {
    //   console.log('onSpeechStop');
});

makeitso.on('speechReady', function() {
    //  console.log('onSpeechReady');
});

makeitso.on('error', function(err) {});

makeitso.on('speechResult', function(results) {
    console.log('onSpeechResult:');
    console.log(results)
});

makeitso.addCommand(["make it so", "do it"], function(result) { console.log(result)})
makeitso.start();