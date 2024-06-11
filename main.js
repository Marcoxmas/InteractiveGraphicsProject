const vertexShaderSource = `
attribute vec4 aPosition;
attribute vec2 aTexCoord;
uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
varying highp vec2 vTexCoord;
void main(void) {
    gl_Position = uProjectionMatrix * uModelViewMatrix * aPosition;
    vTexCoord = aTexCoord;
}
`;

const fragmentShaderSource = `
varying highp vec2 vTexCoord;
uniform sampler2D uSampler;
void main(void) {
    gl_FragColor = texture2D(uSampler, vTexCoord);
}
`;

// Compile shaders and create program
function compileShader(source, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function MatrixMult( A, B )
{
	var C = [];
	for ( var i=0; i<4; ++i ) {
		for ( var j=0; j<4; ++j ) {
			var v = 0;
			for ( var k=0; k<4; ++k ) {
				v += A[j+4*k] * B[k+4*i];
			}
			C.push(v);
		}
	}
	return C;
}

function GetModelView(translationX, translationY, translationZ, rotationX, rotationY )
{
	var transXY = [
		1, 0, 0, 0,
		0, 1, 0, 0,
		0, 0, 1, 0,
		translationX, translationY, 0, 1
	];

    var transZ = [
        1, 0, 0, 0,
		0, 1, 0, 0,
		0, 0, 1, 0,
		0, 0, translationZ, 1
    ];

    var trans = MatrixMult(transZ, transXY);
    var transXYneg = [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        -1*translationX, -1*translationY, 0, 1
    ];
    var transZneg = [
        1, 0, 0, 0,
		0, 1, 0, 0,
		0, 0, 1, 0,
		0, 0, -1*translationZ, 1
    ];
    
	var rotX = [
        1, 0, 0, 0,
        0, Math.cos(rotationX), -Math.sin(rotationX), 0,
        0, Math.sin(rotationX), Math.cos(rotationX), 0,
        0, 0, 0, 1
    ];

    var rotY = [
        Math.cos(rotationY), 0, Math.sin(rotationY), 0,
        0, 1, 0, 0,
        -Math.sin(rotationY), 0, Math.cos(rotationY), 0,
        0, 0, 0, 1
    ];
    var rot = MatrixMult(rotY, rotX);
    //rotate around (0,0,z)
    var modelView = MatrixMult(rot, transXY); // first translate to (x,y,0) then rotate
    modelView = MatrixMult(transZ, modelView); // then translate to (0,0,z)
	return modelView;
}

// Initialize sphere data
function createSphere(radius, latitudeBands, longitudeBands) {
    const vertexPositionData = [];
    const normalData = [];
    const textureCoordData = [];
    const indexData = [];

    for (let latNumber = 0; latNumber <= latitudeBands; ++latNumber) {
        const theta = latNumber * Math.PI / latitudeBands;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        for (let longNumber = 0; longNumber <= longitudeBands; ++longNumber) {
            const phi = longNumber * 2 * Math.PI / longitudeBands;
            const sinPhi = Math.sin(phi);
            const cosPhi = Math.cos(phi);

            const x = cosPhi * sinTheta;
            const y = cosTheta;
            const z = sinPhi * sinTheta;
            const u = 1 - (longNumber / longitudeBands);
            const v = 1 - (latNumber / latitudeBands);

            normalData.push(x);
            normalData.push(y);
            normalData.push(z);
            textureCoordData.push(u);
            textureCoordData.push(v);
            vertexPositionData.push(radius * x);
            vertexPositionData.push(radius * y);
            vertexPositionData.push(radius * z);
        }
    }

    for (let latNumber = 0; latNumber < latitudeBands; ++latNumber) {
        for (let longNumber = 0; longNumber < longitudeBands; ++longNumber) {
            const first = (latNumber * (longitudeBands + 1)) + longNumber;
            const second = first + longitudeBands + 1;
            indexData.push(first);
            indexData.push(second);
            indexData.push(first + 1);

            indexData.push(second);
            indexData.push(second + 1);
            indexData.push(first + 1);
        }
    }

    const vertexPositions = new Float32Array(vertexPositionData);
    const normals = new Float32Array(normalData);
    const textureCoords = new Float32Array(textureCoordData);
    const indices = new Uint16Array(indexData);

    return {
        vertexPositions,
        normals,
        textureCoords,
        indices
    };
}

function createBuffer(data, type, usage) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(type, buffer);
    gl.bufferData(type, data, usage);
    return buffer;
}

function degToRad(degrees) {
    return degrees * Math.PI / 180;
}

// Planet data: name, radius, distance from the sun
const planetsData = [
    { name: "Sun", radius: 1, distance: 0, textureUrl: 'textures/sun.jpg'},
    { name: "Mercury", radius: 0.1, distance: 1.38, textureUrl: 'textures/mercury.jpg'},
    { name: "Venus", radius: 0.3, distance: 2, textureUrl: 'textures/venus.jpg'},
    { name: "Earth", radius: 0.4, distance: 3, textureUrl: 'textures/earth.jpg'},
    { name: "Mars", radius: 0.4, distance: 4.4, textureUrl: 'textures/mars.jpg'},
    { name: "Jupiter", radius: 0.7, distance: 8.2, textureUrl: 'textures/jupiter.jpg'},
    { name: "Saturn", radius: 0.6, distance: 12.58, textureUrl: 'textures/saturn.jpg'},
    { name: "Uranus", radius: 0.5, distance: 20.14, textureUrl: 'textures/uranus.jpg'},
    { name: "Neptune", radius: 0.5, distance: 31.20, textureUrl: 'textures/neptune.jpg'}
];

class PlanetDrawer {
    constructor(gl, radius, distance, textureUrl) {
        this.gl = gl;
        this.radius = radius;
        this.distance = distance;
        this.textureUrl = textureUrl;

        this.setupBuffers();
        this.loadTexture();

        this.vertexShader = compileShader(vertexShaderSource, gl.VERTEX_SHADER);
        this.fragmentShader = compileShader(fragmentShaderSource, gl.FRAGMENT_SHADER);
        this.shaderProgram = gl.createProgram();
        gl.attachShader(this.shaderProgram, this.vertexShader);
        gl.attachShader(this.shaderProgram, this.fragmentShader);
        gl.linkProgram(this.shaderProgram);
        if (!gl.getProgramParameter(this.shaderProgram, gl.LINK_STATUS)) {
            console.error('Unable to initialize the shader program: ' + gl.getProgramInfoLog(this.shaderProgram));
        }
        gl.useProgram(this.shaderProgram);

        this.aPosition = gl.getAttribLocation(this.shaderProgram, 'aPosition');
        this.aTexCoord = gl.getAttribLocation(this.shaderProgram, 'aTexCoord');
        this.uModelViewMatrix = gl.getUniformLocation(this.shaderProgram, 'uModelViewMatrix');
        this.uProjectionMatrix = gl.getUniformLocation(this.shaderProgram, 'uProjectionMatrix');
        this.uSampler = gl.getUniformLocation(this.shaderProgram, 'uSampler');
    }

    setupBuffers() {
        const sphere = createSphere(this.radius, 30, 30);
        this.positionBuffer = this.createBuffer(sphere.vertexPositions, gl.ARRAY_BUFFER, gl.STATIC_DRAW);
        this.normalBuffer = this.createBuffer(sphere.normals, gl.ARRAY_BUFFER, gl.STATIC_DRAW);
        this.textureCoordBuffer = this.createBuffer(sphere.textureCoords, gl.ARRAY_BUFFER, gl.STATIC_DRAW);
        this.indexBuffer = this.createBuffer(sphere.indices, gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);
        this.vertexCount = sphere.indices.length;
    }

    createBuffer(data, type, usage) {
        const buffer = this.gl.createBuffer();
        this.gl.bindBuffer(type, buffer);
        this.gl.bufferData(type, data, usage);
        return buffer;
    }

    loadTexture() {
        this.texture = this.gl.createTexture();
        const image = new Image();
        image.onload = () => {
            this.gl.bindTexture(gl.TEXTURE_2D, this.texture);
            this.gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            this.gl.generateMipmap(gl.TEXTURE_2D);
        };
        image.src = this.textureUrl;
    }

    draw(projectionMatrix) {
        gl.useProgram(this.shaderProgram);
        var modelViewMatrix = GetModelView(-this.distance, 0, transZ, rotX, rotY);

        console.log("draw");

        this.gl.uniformMatrix4fv(this.uProjectionMatrix, false, projectionMatrix);
        this.gl.uniformMatrix4fv(this.uModelViewMatrix, false, modelViewMatrix);

        this.gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        this.gl.vertexAttribPointer(this.aPosition, 3, gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(this.aPosition);

        this.gl.bindBuffer(gl.ARRAY_BUFFER, this.textureCoordBuffer);
        this.gl.vertexAttribPointer(this.aTexCoord, 2, gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(this.aTexCoord);

        this.gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);

        this.gl.activeTexture(gl.TEXTURE0);
        this.gl.bindTexture(gl.TEXTURE_2D, this.texture);
        this.gl.uniform1i(this.uSampler, 0);

        this.gl.drawElements(gl.TRIANGLES, this.vertexCount, gl.UNSIGNED_SHORT, 0);
    }
}

var planetDrawers;
var canvas, gl;
var perspectiveMatrix;	// perspective projection matrix
var rotX=0, rotY=0, transZ=3, autorot=0;
// Called once to initialize
function InitWebGL()
{
	// Initialize the WebGL canvas
	canvas = document.getElementById("canvas");
	gl = canvas.getContext("webgl");
	if (!gl) {
		alert("Unable to initialize WebGL. Your browser or machine may not support it.");
		return;
	}
	
	// Initialize settings
	gl.clearColor(0,0,0,1);
	gl.enable(gl.DEPTH_TEST);
	
	// Initialize the programs and buffers for drawing
	planetDrawers = planetsData.map(planetData =>
        new PlanetDrawer(gl, planetData.radius, planetData.distance, planetData.textureUrl)
    );
	
	// Set the viewport size
	UpdateCanvasSize();
}


// Called every time the window size is changed.
function UpdateCanvasSize()
{
	canvas.style.width  = "100%";
	canvas.style.height = "100%";
	const pixelRatio = window.devicePixelRatio || 1;
	canvas.width  = pixelRatio * canvas.clientWidth;
	canvas.height = pixelRatio * canvas.clientHeight;
	const width  = (canvas.width  / pixelRatio);
	const height = (canvas.height / pixelRatio);
	canvas.style.width  = width  + 'px';
	canvas.style.height = height + 'px';
	gl.viewport( 0, 0, canvas.width, canvas.height );
	UpdateProjectionMatrix();
}

perspectiveMatrix = mat4.create();

function UpdateProjectionMatrix()
{
	var r = canvas.width / canvas.height;
	var n = (transZ - 1.74);
	const min_n = 0.001;
	if ( n < min_n ) n = min_n;
	var f = (transZ + 1.74);;
	var fov = 3.145 * 60 / 180;
	var s = 1 / Math.tan( fov/2 );
	perspectiveMatrix = [
		s/r, 0, 0, 0,
		0, s, 0, 0,
		0, 0, (n+f)/(f-n), 1,
		0, 0, -2*n*f/(f-n), 0
	];
}

function drawScene() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.viewport(0, 0, canvas.width, canvas.height);
    console.log("drawscene");
    planetDrawers.forEach(planetDrawer => {
        planetDrawer.draw(perspectiveMatrix);
    });

}

let dx, dy;
window.onload = function() {
	InitWebGL();
	canvas.zoom = function( s ) {
		transZ *= s/canvas.height + 1;
		UpdateProjectionMatrix();
		drawScene();
	}
	canvas.onwheel = function() { canvas.zoom(0.3*event.deltaY); }
	canvas.onmousedown = function() {
		var cx = event.clientX;
		var cy = event.clientY;
		if ( event.ctrlKey ) {
			canvas.onmousemove = function() {
				canvas.zoom(5*(event.clientY - cy));
				cy = event.clientY;
			}
		} else {
			canvas.onmousemove = function() {
				rotY += (cx - event.clientX)/canvas.width*5;
				rotX += (cy - event.clientY)/canvas.height*5;
				cx = event.clientX;
				cy = event.clientY;
				UpdateProjectionMatrix();
				drawScene();
			}
		}
	}
	canvas.onmouseup = canvas.onmouseleave = function() {
		canvas.onmousemove = null;
	}
	
	drawScene();
};
function WindowResize()
{
	UpdateCanvasSize();
	drawScene();
}