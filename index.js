var video = document.querySelector("#videoElement");
var trainingVideo = document.getElementById('trainingVideo');
var network;
var ready = false;
var v,canvas,context,w,h;

//these variables are for training purposes only. not required for the final system to run
var getVideoFromCam = false;
var link = document.createElement('a');
link.innerHTML = 'download image';
var croppedImage;

var fileinput = document.getElementById('fileinput');

// check for getUserMedia support
navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia || navigator.oGetUserMedia;

if (navigator.getUserMedia) {
    // get webcam feed if available
    navigator.getUserMedia({video: true}, handleVideo, videoError);
}

function handleVideo(stream) {
    // if found attach feed to video element
    if(getVideoFromCam)
      video.src = window.URL.createObjectURL(stream);
}

function videoError(e) {
    // no webcam found - do something
}

document.addEventListener('DOMContentLoaded', function(){
    // when DOM loaded, get canvas 2D context and store width and height of element
    v = document.getElementById('videoElement');
    canvas = document.getElementById('canvas');
    context = canvas.getContext('2d');
    w = canvas.width;
    h = canvas.height;

    let saveImage = function(ev) {

      if(croppedImage != null) {
        let newCanvas = document.createElement('canvas');
        let newContext = newCanvas.getContext('2d');
        newCanvas.width = croppedImage.width;
        newCanvas.height = croppedImage.height;
        newContext.putImageData(croppedImage, 0, 0);

        link.href = newCanvas.toDataURL();
        link.download = "training.png";
      }

      croppedImage = null;
    };

    link.addEventListener('click', saveImage, false);
    document.body.appendChild(link);

    if(!getVideoFromCam) {
      trainingVideo.addEventListener('play', function() {
        var $this = this; //cache
        (function loop() {
          if (!$this.paused && !$this.ended) {
            context.drawImage($this, 0, 0);
            setTimeout(loop, 1000 / 30); // drawing at 30fps
            }
          })();
        }, 0);
    }

    var imageScaleFactor = 0.5;
    var outputStride = 16;
    var flipHorizontal = false;
    const maxPoseDetections = 5;
    const scoreThreshold = 0.8;
    const nmsRadius = 20;

    posenet.load().then(function(net){
      network = net;
      ready = true;
    });

    var fr;
    var loading = false;
    setInterval(()=> {

    	if(ready && !loading) {
        loading = true;
        croppedImage = null;
    		network.estimateMultiplePoses(canvas, imageScaleFactor,
    		flipHorizontal, outputStride, maxPoseDetections, scoreThreshold, nmsRadius).then((poses)=> {

          draw(v,context,w,h);

          let imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          let data = imageData.data;

          // for (var i = 0; i < data.length; i += 4) {
          //
          //   let d0 = data[i] / data[i + 1];
          //   let d1 = data[i] / data[i + 2];
          //   let d2 = data[i + 1] / data[i + 2];
          //
          //   let t0 = d0 < 1.2 && d0 > 0.8;
          //   let t1 = d1 < 1.2 && d1 > 0.8;
          //   let t2 = d2 < 1.2 && d2 > 0.8;
          //
          //   if(t0 && t1 && t2) {
          //     data[i]     = 255;     // red
          //     data[i + 1] = 255; // green
          //     data[i + 2] = 255; // blue
          //   }
          // }

          context.putImageData(imageData, 0, 0);

          for(let i = 0; i < poses.length; i++) {
            let pose = poses[i];

            let leftHipX = pose.keypoints[11].position.x;
            let leftHipY = pose.keypoints[11].position.y;

            let rightHipX = pose.keypoints[12].position.x;
            let rightHipY = pose.keypoints[12].position.y;

            let leftElbowX = pose.keypoints[7].position.x
            let rightElbowX = pose.keypoints[8].position.x;

            let noseY = pose.keypoints[0].position.y;

            console.log(noseY);

            drawLine(leftElbowX, noseY, rightElbowX, noseY);
            drawLine(rightElbowX, rightHipY, rightElbowX, noseY);
            drawLine(leftElbowX, leftHipY, rightElbowX, rightHipY);
            drawLine(leftElbowX, leftHipY, leftElbowX, noseY);

            let widthX = Math.sqrt(Math.pow(leftElbowX - rightElbowX, 2));
            let widthY = Math.sqrt(Math.pow(noseY - leftHipY, 2));

            if(widthX > 50) {
              croppedImage = context.getImageData(rightElbowX, noseY, widthX, widthY);
              link.click();
            }
          }
          loading = false;
    		});
    	}

      //run at 30fps
    },33);

},false);

function draw(v,c,w,h) {
    if(v.paused || v.ended) return false; // if no video, exit here
    context.drawImage(v,0,0,w,h); // draw video feed to canvas
}

function drawLine(x0, y0, x1, y1) {
  context.beginPath();
  context.moveTo(x0,y0);
  context.lineTo(x1, y1);
  context.stroke();
}

//lines is a 2D array containing x and ys
function drawLines(lines) {

  let x0 = lines[0][0];
  let y0 = lines[0][1];

  for(var i = 1; i < lines.length; i++) {
    drawLine(x0, y0, lines[i][0], lines[i][1]);
    x0 = lines[i][0];
    y0 = lines[i][0];
  }

}

function drawRect(x0, y0, x1, y1) {
  context.beginPath();
  context.rect(x0,y0,x1,y1);
  context.stroke();
}

function getDistance(x, y, x1, y1) {
  return Math.sqrt(Math.pow(x1 - x, 2) + Math.pow(y1 - y, 2));
}
