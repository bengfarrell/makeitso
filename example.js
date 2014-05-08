var MakeItSo = require('./lib/makeitso');

// Setup google speech
var opts = {
    soxLocation: "C:/Program Files (x86)/sox-14-4-1/sox",
    verbose: true,
    silenceTrimThresholdStart: '0.1%',
    silenceTrimThresholdEnd: '0.1%',
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

makeitso.on('error', function(err) {
    console.log('onError:');
    console.log(err);
    makeitso.start();
});

makeitso.on('speechResult', function(results) {
    console.log('onSpeechResult:');
    console.log(results)
    //console.log(spokenWords.isInterimResults.toString() + ": " + JSON.stringify(spokenWords.hypotheses));
    makeitso.start();
});

makeitso.start();