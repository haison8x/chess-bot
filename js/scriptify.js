function includejQuery(callback) {
  if (window.jQuery) {
    // jQuery is already loaded, set up an asynchronous call
    // to the callback if any
    if (callback) {
      setTimeout(function () {
        callback(jQuery);
      }, 0);
    }
  }
  else {
    // jQuery not loaded, load it and when it loads call
    // noConflict and the callback (if any).
    var script = document.createElement('script');
    script.onload = function () {      
      if (callback) {
        callback();
      }
    };
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js";
    document.getElementsByTagName('head')[0].appendChild(script);
  }
}

function includeChessJs(callback) {
  if (window.Chess) {
    // Chess is already loaded, set up an asynchronous call
    // to the callback if any
    if (callback) {
      setTimeout(function () {
        callback();
      }, 0);
    }
  }
  else {
    // Chess not loaded, load it and when it loads call
    // noConflict and the callback (if any).
    var script = document.createElement('script');
    script.onload = function () {
      if (callback) {
        callback();
      }
    };
    script.src = "https://raw.githubusercontent.com/haison8x/chess-bot/master/js/chess.js";
    document.getElementsByTagName('head')[0].appendChild(script);
  }
}

function includeChessAction(callback) {
  if (window.ChessAction) {
    // Chess is already loaded, set up an asynchronous call
    // to the callback if any
    if (callback) {
      setTimeout(function () {
        callback();
      }, 0);
    }
  }
  else {
    // Chess not loaded, load it and when it loads call
    // noConflict and the callback (if any).
    var script = document.createElement('script');
    script.onload = function () {
      if (callback) {
        callback();
      }
    };
    script.src = "https://raw.githubusercontent.com/haison8x/chess-bot/master/js/action.js";
    document.getElementsByTagName('head')[0].appendChild(script);
  }
}

setTimeout(function () {
  includejQuery(function () {
    includeChessJs(function () {
      includeChessAction(function () { 
        alert("ChessAction is loaded") });
    });
  });
}, 1000)
