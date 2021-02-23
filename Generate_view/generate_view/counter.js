function startCounter() {
	return new Date();
}

function endCounter(startCounter) {
	_endCounter = new Date();
	_durationInSeconds = parseInt((_endCounter - startCounter) / 1000);
	_minutes = parseInt(_durationInSeconds / 60);
	_seconds = parseInt(_durationInSeconds % 60);
	return {minutes:_minutes, seconds: _seconds};
}