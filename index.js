var video = document.querySelector("#videoElement");
var trainingVideo = document.getElementById('trainingVideo');
var network;
var ready = false;
var v,canvas,context,w,h;

//these variables are for training purposes only. not required for the final system to run
var getVideoFromCam = true;
var link = document.createElement('a');
link.innerHTML = 'download image';
var croppedImage;

var fileinput = document.getElementById('fileinput');
var modelReady = false;
var model;

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

      // if(croppedImage != null) {
      //   let newCanvas = document.createElement('canvas');
      //   let newContext = newCanvas.getContext('2d');
      //   newCanvas.width = croppedImage.width;
      //   newCanvas.height = croppedImage.height;
      //   newContext.putImageData(croppedImage, 0, 0);
      //
      //   link.href = newCanvas.toDataURL();
      //   link.download = "training.png";
      // }

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

            let widthX = Math.sqrt(Math.pow(leftElbowX - rightElbowX, 2));
            let widthY = Math.sqrt(Math.pow(noseY - leftHipY, 2));

            if(widthX > 50) {
              if(modelReady) {

                croppedImage = context.getImageData(rightElbowX, noseY, widthX, widthY);
                let c = document.createElement('canvas');
                c.width = 224;
                c.height = 224;
                let nc = c.getContext('2d');

                nc.putImageData(croppedImage, 0, 0);

                tf.tidy(()=> {
                  const tf_pixel = tf.fromPixels(c);
                  const tf_img_batched = tf_pixel.expandDims(0);
                  const tf_final_img_batched = tf_img_batched.toFloat().div(tf.scalar(127)).sub(tf.scalar(1));

                  const predictedClass = tf.tidy(() => {
                    const activation = mobilenet.predict(tf_final_img_batched);
                    const predictions = model.predict(activation);
                    const value = predictions.as1D().argMax().dataSync();
                    console.log(value)

                    let color = "#00ff00";

                    if(value == 2) {
                      color = "#ff0000";
                    }


                    drawLine(leftElbowX, noseY, rightElbowX, noseY, color);
                    drawLine(rightElbowX, rightHipY, rightElbowX, noseY, color);
                    drawLine(leftElbowX, leftHipY, rightElbowX, rightHipY, color);
                    drawLine(leftElbowX, leftHipY, leftElbowX, noseY, color);
                  });
                });
              }


              // link.click();
            }
          }
          loading = false;
    		});
    	}

      //run at 30fps
    },40);

},false);

function draw(v,c,w,h) {
    if(v.paused || v.ended) return false; // if no video, exit here
    context.drawImage(v,0,0,w,h); // draw video feed to canvas
}

function drawLine(x0, y0, x1, y1, color) {
  context.beginPath();
  context.moveTo(x0,y0);
  context.lineTo(x1, y1);
  context.lineWidth = 10;
  context.strokeStyle = color;
  context.stroke();
}

//lines is a 2D array containing x and ys
function drawLines(lines, color) {

  let x0 = lines[0][0];
  let y0 = lines[0][1];

  for(var i = 1; i < lines.length; i++) {
    drawLine(x0, y0, lines[i][0], lines[i][1], color);
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

async function loadModel() {
  model = await tf.loadModel("http://localhost:9000/model.json");
}

//load mobile net from cdn
async function loadMobilenet() {
  const mobilenet = await tf.loadModel(
      'https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json');

  // Return a model that outputs an internal activation.
  const layer = mobilenet.getLayer('conv_pw_13_relu');
  return tf.model({inputs: mobilenet.inputs, outputs: layer.output});
};

async function init() {
  mobilenet = await loadMobilenet();
  model = loadModel();
  modelReady = true;
}

init();
