/*
 * Event listeners for various buttons.
 */

jQuery('#player-bottom').off('click')
jQuery('#player-bottom').on('click', function () {
  var pgn = getCurrentPgn()
  
  //1. d3 e5 2. e4 d6
  game.reset()
  for (let i = 0; i < pgn.length; i++) {
    game.move(pgn[i])
  }

  if (game.in_checkmate() || game.in_draw() || game.in_threefold_repetition() || game.in_stalemate()) {
    return false
  }

  var turn = game.turn()
  var move = getBestMove(game, turn, 0)[0]
  
  jQuery('.player-row-top .user-username-component').text(move.from + '->' + move.to)

  highlightMove(move.from)
  highlightMove(move.to)
  console.log(pgn)
  console.log(move)
  return false
})

function getCurrentPgn() {
  let pgn = []
  jQuery('#scroll-container .move').each(function (i, e) {
    jQuery(e)
      .find('div')
      .each(function (i1, e1) {
        let move = jQuery(e1).text()
        move = move.trim()
        pgn.push(move)
      })
  })

  return pgn
}

function toCoordinates(move) {
  let code = move[0].charCodeAt(0)
  let number = code - 97 + 1
  return [number, parseInt(move[1])]
}

function highlightMove(move){
  let coordinates = toCoordinates(move)
  jQuery('#board-layout-chessboard .square-' + coordinates[0] + coordinates[1]).css('background-color', 'red')
}

function resetHighlight() {
  for (let i = 1; i <= 8; i++) {
    for (let j = 1; j <= 8; j++) {
      jQuery('#board-layout-chessboard .square-' + i + j).css('background-color', '')
    }
  }
}
