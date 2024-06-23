const vertexShaderSource = `
attribute vec4 aPosition;
attribute vec3 aNormal;
attribute vec2 aTexCoord;

uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
uniform vec3 uLightPosition;

varying highp vec2 vTexCoord;
varying highp vec3 vLightDirection;
varying highp vec3 vNormal;

void main(void) {
    vec4 worldPosition = uModelViewMatrix * aPosition;
    
    vTexCoord = aTexCoord;
    vNormal = mat3(uModelViewMatrix) * aNormal;
    vLightDirection = uLightPosition - vec3(worldPosition);

    gl_Position = uProjectionMatrix * uModelViewMatrix * aPosition;
}
`;


const fragmentShaderSource = `
precision highp float;
varying highp vec2 vTexCoord;
varying highp vec3 vNormal;
varying highp vec3 vLightDirection;

uniform sampler2D uSampler;
uniform vec3 uLightColor;
uniform int isSun;

void main(void) {
    vec4 texelColor = texture2D(uSampler, vTexCoord);
    if (isSun == 0){
        highp vec3 normal = normalize(vNormal);
        highp vec3 lightDir = normalize(vLightDirection);

        // Ambient light
        highp vec3 ambientLight = vec3(0.2, 0.2, 0.2);

        // Diffuse light
        float diff = max(dot(normal, lightDir), 0.0);
        highp vec3 diffuse = diff * uLightColor;

        // Specular light
        highp vec3 viewDir = normalize(-vLightDirection); // Assuming the view direction is along the light direction
        highp vec3 reflectDir = reflect(-lightDir, normal);
        float spec = pow(max(dot(viewDir, reflectDir), 0.0), 10000000.0);
        highp vec3 specular = spec * uLightColor;

        // Combine the results
        highp vec3 lighting = ambientLight + diffuse + specular;
        gl_FragColor = vec4(lighting * texelColor.rgb, texelColor.a);
    }
    if (isSun == 1) {
        gl_FragColor = texelColor;
    }
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

function isPowerOfTwo(value) {
    return (value & (value - 1)) == 0;
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

function MatrixVectorMult(matrix, vector) {
    var result = [0, 0, 0, 0];
    for (var i = 0; i < 4; i++) {
        for (var j = 0; j < 4; j++) {
            result[i] += matrix[j * 4 + i] * vector[j];
        }
    }
    return result;
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
            const v = (latNumber / latitudeBands);

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

// Initialize orbit data
function createOrbitVertices(radius, segments, thickness = 0.02, layers = 5) {
    const vertices = [];
    for (let j = 0; j < layers; j++) {
        const currentRadius = radius + (j * thickness / layers);
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * 2 * Math.PI;
            vertices.push(currentRadius * Math.cos(angle), currentRadius * Math.sin(angle), 0);
        }
    }
    return vertices;
}

// Initialize rings data
function createRingsVertices(innerRadius, outerRadius, segments) {
    const vertices = [];
    const textureCoords = [];
    const normals = [];
    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * 2 * Math.PI;
        const cosAngle = Math.cos(angle);
        const sinAngle = Math.sin(angle);
        
        // Vertices for inner and outer rings
        vertices.push(innerRadius * cosAngle, innerRadius * sinAngle, 0);
        vertices.push(outerRadius * cosAngle, outerRadius * sinAngle, 0);
        
        // Texture coordinates
        textureCoords.push(i / segments, 0); 
        textureCoords.push(i / segments, 1); 
        
        // Normals (pointing outward along Z axis)
        normals.push(0, 0, -1);
        normals.push(0, 0, -1);
    }
    return { vertices, textureCoords, normals };
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
    { name: "Sun", radius: 1, distance: 0, textureUrl: 'textures/sun.jpg', starting_angle: 0, revolution_mult: 0, rotation_mult: 27},
    { name: "Mercury", radius: 0.1, distance: 1.38, textureUrl: 'textures/mercury.jpg', starting_angle: 135, revolution_mult: 0.24, rotation_mult: 58.6},
    { name: "Venus", radius: 0.3, distance: 2, textureUrl: 'textures/venus.jpg', starting_angle: 35, revolution_mult: 0.61, rotation_mult: 243},
    { name: "Earth", radius: 0.4, distance: 3, textureUrl: 'textures/earth.jpg', starting_angle: 180, revolution_mult: 1, rotation_mult: 1},
    { name: "Mars", radius: 0.4, distance: 4.4, textureUrl: 'textures/mars.jpg', starting_angle: 285,revolution_mult: 1.88, rotation_mult: 1.03},
    { name: "Jupiter", radius: 0.7, distance: 8.2, textureUrl: 'textures/jupiter.jpg', starting_angle: 100,revolution_mult: 11.86, rotation_mult: 0.41},
    { name: "Saturn", radius: 0.6, distance: 12.58, textureUrl: 'textures/saturn.jpg', starting_angle: 130,revolution_mult: 29.46, rotation_mult: 0.45},
    { name: "Uranus", radius: 0.5, distance: 20.14, textureUrl: 'textures/uranus.jpg', starting_angle: 60,revolution_mult: 84.01, rotation_mult: 0.72},
    { name: "Neptune", radius: 0.5, distance: 31.20, textureUrl: 'textures/neptune.jpg', starting_angle: 85,revolution_mult: 164.79, rotation_mult: 0.67},
];
// Planet drawer class
class PlanetDrawer {
    constructor(gl, name, radius, distance, textureUrl, starting_angle, revolution_mult, rotation_mult, isSun = 0) {
        this.gl = gl;
        this.name = name;
        this.radius = radius;
        this.distance = distance;
        this.textureUrl = textureUrl;
        this.starting_angle = starting_angle;
        this.revolution_mult = revolution_mult;
        this.rotation_mult = rotation_mult;
        this.isSun = isSun;
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
        this.aNormal = gl.getAttribLocation(this.shaderProgram, 'aNormal');
        this.uModelViewMatrix = gl.getUniformLocation(this.shaderProgram, 'uModelViewMatrix');
        this.uProjectionMatrix = gl.getUniformLocation(this.shaderProgram, 'uProjectionMatrix');
        this.uSampler = gl.getUniformLocation(this.shaderProgram, 'uSampler');
        this.normalMatrix = gl.getUniformLocation(this.shaderProgram, 'uNormalMatrix');
        this.uLightPosition = gl.getUniformLocation(this.shaderProgram, 'uLightPosition');
        this.uLightColor = gl.getUniformLocation(this.shaderProgram, 'uLightColor');
        this.isSunShader = gl.getUniformLocation(this.shaderProgram, 'isSun');
        this.gl.uniform1i(this.isSunShader, this.isSun);
    }

    setupBuffers() {
        const sphere = createSphere(this.radius, 30, 30);
        this.positionBuffer = createBuffer(sphere.vertexPositions, gl.ARRAY_BUFFER, gl.STATIC_DRAW);
        this.normalBuffer = createBuffer(sphere.normals, gl.ARRAY_BUFFER, gl.STATIC_DRAW);
        this.textureCoordBuffer = createBuffer(sphere.textureCoords, gl.ARRAY_BUFFER, gl.STATIC_DRAW);
        this.indexBuffer = createBuffer(sphere.indices, gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);
        this.vertexCount = sphere.indices.length;
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
        // Polar coordinates
        if(this.revolution_mult != 0)
            var theta = degToRad(this.starting_angle) + autorev/this.revolution_mult;
        else
            var theta = degToRad(this.starting_angle);
        var alpha = autorot / this.rotation_mult;
        var transXadd = this.distance * Math.cos(theta);
        var transZadd = this.distance * Math.sin(theta);
        //console.log(transXadd, transZadd, this.distance);
        var modelViewMatrix = GetModelView(transX + transXadd, transY, transZ, rotX, rotY);
        // need to transalate Z axis more
        var transZaddmat = [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, transZadd, 1
        ];
        var rotmatY = [
            Math.cos(alpha), 0, Math.sin(alpha), 0,
            0, 1, 0, 0,
            -Math.sin(alpha), 0, Math.cos(alpha), 0,
            0, 0, 0, 1
        ];
        var transform = MatrixMult(transZaddmat, rotmatY); // first self rotation
        modelViewMatrix = MatrixMult(modelViewMatrix, transform);

        this.center = MatrixVectorMult(modelViewMatrix, [0, 0, 0, 1]);

        var lightmv = GetModelView(transX, transY, transZ, rotX, rotY);
        var lightPosition = [0.0, 0.0, 0.0, 1.0];
        lightPosition = MatrixVectorMult(lightmv, lightPosition);
        //console.log(lightmv, lightPosition);

        gl.uniform3f(this.uLightPosition, lightPosition[0], lightPosition[1], lightPosition[2]);
        gl.uniform3f(this.uLightColor, 1.0, 1.0, 1.0);

        //console.log("draw");

        this.gl.uniformMatrix4fv(this.uProjectionMatrix, false, projectionMatrix);
        this.gl.uniformMatrix4fv(this.uModelViewMatrix, false, modelViewMatrix);

        this.gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        this.gl.vertexAttribPointer(this.aPosition, 3, gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(this.aPosition);

        this.gl.bindBuffer(gl.ARRAY_BUFFER, this.textureCoordBuffer);
        this.gl.vertexAttribPointer(this.aTexCoord, 2, gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(this.aTexCoord);

        this.gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);

        this.gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
        this.gl.vertexAttribPointer(this.aNormal, 3, gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(this.aNormal);

        this.gl.activeTexture(gl.TEXTURE0);
        this.gl.bindTexture(gl.TEXTURE_2D, this.texture);
        this.gl.uniform1i(this.uSampler, 0);

        this.gl.drawElements(gl.TRIANGLES, this.vertexCount, gl.UNSIGNED_SHORT, 0);
    }

    intersectSphere(ray) {
        const oc = vec3.create();
        vec3.sub(oc, ray.origin, this.center);

        const a = vec3.dot(ray.direction, ray.direction);
        const b = 2.0 * vec3.dot(oc, ray.direction);
        const c = vec3.dot(oc, oc) - this.radius * this.radius;
        const discriminant = b * b - 4 * a * c;

        return (discriminant > 0);
    }
}

class SaturnRingsDrawer {
    constructor(gl, distance, starting_angle,revolution_mult,textureUrl) {
        this.gl = gl;
        this.distance = distance;
        this.starting_angle = starting_angle;
        this.revolution_mult = revolution_mult;
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
        this.aNormal = gl.getAttribLocation(this.shaderProgram, 'aNormal');
        this.uModelViewMatrix = gl.getUniformLocation(this.shaderProgram, 'uModelViewMatrix');
        this.uProjectionMatrix = gl.getUniformLocation(this.shaderProgram, 'uProjectionMatrix');
        this.uSampler = gl.getUniformLocation(this.shaderProgram, 'uSampler');
        this.uLightPosition = gl.getUniformLocation(this.shaderProgram, 'uLightPosition');
        this.uLightColor = gl.getUniformLocation(this.shaderProgram, 'uLightColor');
    }

    setupBuffers() {
        const { vertices, textureCoords, normals } = createRingsVertices(1.2, 1.6, 100);
    
        this.positionBuffer = createBuffer(new Float32Array(vertices), gl.ARRAY_BUFFER, gl.STATIC_DRAW);
        this.textureCoordBuffer = createBuffer(new Float32Array(textureCoords), gl.ARRAY_BUFFER, gl.STATIC_DRAW);
        this.normalBuffer = createBuffer(new Float32Array(normals), gl.ARRAY_BUFFER, gl.STATIC_DRAW);
        
        this.vertexCount = vertices.length / 3;
    }

    loadTexture() {
        this.texture = this.gl.createTexture();
        const image = new Image();
        image.onload = () => {
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, image);
            
            // Texture is not power of 2. Turn of mips and set wrapping to clamp to edge
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        };
        image.src = this.textureUrl;
    }

    draw(projectionMatrix) {
        gl.useProgram(this.shaderProgram);
        // Polar coordinates
        var theta = degToRad(this.starting_angle) + autorev/this.revolution_mult;
        var transXadd = this.distance * Math.cos(theta);
        var transZadd = this.distance * Math.sin(theta);
        //console.log(transXadd, transZadd, this.distance);
        var modelViewMatrix = GetModelView(transX + transXadd, transY, transZ, rotX, rotY);
        // need to transalate Z axis more
        var transZaddmat = [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, transZadd, 1
        ];
        modelViewMatrix = MatrixMult(modelViewMatrix, transZaddmat);
        // rotate the rings around saturn
        var rx = degToRad(-50);
        var ry = degToRad(90);
        var matrotX = [
            1, 0, 0, 0,
            0, Math.cos(rx), -Math.sin(rx), 0,
            0, Math.sin(rx), Math.cos(rx), 0,
            0, 0, 0, 1
        ];
    
        var matrotY = [
            Math.cos(ry), 0, Math.sin(ry), 0,
            0, 1, 0, 0,
            -Math.sin(ry), 0, Math.cos(ry), 0,
            0, 0, 0, 1
        ];
        var rotation = MatrixMult(matrotY, matrotX);
        modelViewMatrix = MatrixMult(modelViewMatrix, rotation);

        var lightmv = GetModelView(transX, transY, transZ, rotX, rotY);
        var lightPosition = [0.0, 0.0, 0.0, 1.0];
        lightPosition = MatrixVectorMult(lightmv, lightPosition);
        //console.log(lightmv, lightPosition);
        
        gl.uniform3f(this.uLightPosition, lightPosition[0], lightPosition[1], lightPosition[2]);
        this.gl.uniform3f(this.uLightColor, 1.0, 1.0, 1.0);

        this.gl.uniformMatrix4fv(this.uProjectionMatrix, false, projectionMatrix);
        this.gl.uniformMatrix4fv(this.uModelViewMatrix, false, modelViewMatrix);

        this.gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        this.gl.vertexAttribPointer(this.aPosition, 3, gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(this.aPosition);

        this.gl.bindBuffer(gl.ARRAY_BUFFER, this.textureCoordBuffer);
        this.gl.vertexAttribPointer(this.aTexCoord, 2, gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(this.aTexCoord);

        this.gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
        this.gl.vertexAttribPointer(this.aNormal, 3, gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(this.aNormal);

        this.gl.activeTexture(gl.TEXTURE0);
        this.gl.bindTexture(gl.TEXTURE_2D, this.texture);
        this.gl.uniform1i(this.uSampler, 0);

        this.gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.vertexCount);
    }
}

const orbitVertexShaderSource = `
attribute vec4 aPosition;
uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
void main(void) {

    gl_Position = uProjectionMatrix * uModelViewMatrix * aPosition;
}
`;
const orbitFragmentShaderSource = `
void main(void) {
    gl_FragColor = vec4(0.5, 0.5, 0.5, 1.0);
}
`;

const orbitsData = planetsData.map(planetData => {
    const radius = planetData.distance;
    const orbitVertices = createOrbitVertices(planetData.distance, 100);
    return {radius: radius, vertices: orbitVertices, vertexCount: orbitVertices.length / 3};
});

// Orbit drawer class
class OrbitDrawer{
    constructor(gl, distance, vertices, vertexCount) {
        this.gl = gl;
        this.distance = distance;
        this.vertices = vertices;
        this.vertexCount = vertexCount;

        this.setupBuffers();

        this.vertexShader = compileShader(orbitVertexShaderSource, gl.VERTEX_SHADER);
        this.fragmentShader = compileShader(orbitFragmentShaderSource, gl.FRAGMENT_SHADER);
        this.shaderProgram = gl.createProgram();
        gl.attachShader(this.shaderProgram, this.vertexShader);
        gl.attachShader(this.shaderProgram, this.fragmentShader);
        gl.linkProgram(this.shaderProgram);
        if (!gl.getProgramParameter(this.shaderProgram, gl.LINK_STATUS)) {
            console.error('Unable to initialize the shader program: ' + gl.getProgramInfoLog(this.shaderProgram));
        }
        gl.useProgram(this.shaderProgram);

        this.aPosition = gl.getAttribLocation(this.shaderProgram, 'aPosition');
        this.uModelViewMatrix = gl.getUniformLocation(this.shaderProgram, 'uModelViewMatrix');
        this.uProjectionMatrix = gl.getUniformLocation(this.shaderProgram, 'uProjectionMatrix');
    }

    setupBuffers() {
        this.orbitBuffer = createBuffer(new Float32Array(this.vertices), gl.ARRAY_BUFFER, gl.STATIC_DRAW);
    }


    draw(projectionMatrix) {
        gl.useProgram(this.shaderProgram);
        var modelViewMatrix = GetModelView(transX, transY, transZ, rotX, rotY);

        var rx = degToRad(90);
        var matrotX = [
            1, 0, 0, 0,
            0, Math.cos(rx), -Math.sin(rx), 0,
            0, Math.sin(rx), Math.cos(rx), 0,
            0, 0, 0, 1
        ];
        modelViewMatrix = MatrixMult(modelViewMatrix, matrotX);
        this.gl.uniformMatrix4fv(this.uProjectionMatrix, false, projectionMatrix);
        this.gl.uniformMatrix4fv(this.uModelViewMatrix, false, modelViewMatrix);

        this.gl.bindBuffer(gl.ARRAY_BUFFER, this.orbitBuffer);
        this.gl.vertexAttribPointer(this.aPosition, 3, gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(this.aPosition);

        this.gl.drawArrays(gl.LINE_LOOP, 0, this.vertexCount);
    }
}



var planetDrawers;
var orbitDrawers;
var ringsDrawer;
var lightPosition;
var transformedLightPosition;
var canvas, gl;
var perspectiveMatrix;	// perspective projection matrix
var rotX=0, rotY=0, transZ=10, autorot=0, transX=0, transY=0, autorev=0;
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
    planetDrawers = planetsData.map((planetData, index) => {
        if (index === 0) {
            return new PlanetDrawer(gl, planetData.name, planetData.radius, planetData.distance, planetData.textureUrl, planetData.starting_angle, planetData.revolution_mult, planetData.rotation_mult, 1);
        } else {
            return new PlanetDrawer(gl, planetData.name, planetData.radius, planetData.distance, planetData.textureUrl, planetData.starting_angle, planetData.revolution_mult, planetData.rotation_mult);
        }
    });
	// Initialize the program and buffers for drawing orbits
    orbitDrawers = orbitsData.map(orbitData =>
        new OrbitDrawer(gl, orbitData.radius, orbitData.vertices, orbitData.vertexCount)
    );

    ringsDrawer = new SaturnRingsDrawer(gl, planetsData[6].distance, planetsData[6].starting_angle,planetsData[6].revolution_mult,'textures/saturn_rings.png');

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
	var n = (transZ - 100); //near clipping plane
	const min_n = 0.001;
	if ( n < min_n ) n = min_n;
	var f = (transZ + 100); //far clipping plane
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
    //console.log("drawscene");
    planetDrawers.forEach(planetDrawer => {
        planetDrawer.draw(perspectiveMatrix);
    });

    orbitDrawers.forEach(orbitDrawer => {
        orbitDrawer.draw(perspectiveMatrix);
    });

    ringsDrawer.draw(perspectiveMatrix);
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
		} else if (event.shiftKey) {
            canvas.onmousemove = function() {
                const transMultiplier = 5.0;
                transX += transMultiplier * (event.clientX - cx) / canvas.width;
                transY -= transMultiplier * (event.clientY - cy) / canvas.height;
                cx = event.clientX;
                cy = event.clientY;
                UpdateProjectionMatrix();
                drawScene();
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

    canvas.addEventListener('click', onMouseClick, false);

    document.getElementById('reset-button').addEventListener('click', function() {
        transX = 0;
        transY = 0;
        transZ = 10;
        rotX = 0;
        rotY = 0;
        autorot = 0;
        autorev = 0;
        UpdateProjectionMatrix();
        drawScene();
    });

    document.getElementById('play').addEventListener('click', function() {
        AutoRotate(true);
    });

    document.getElementById('pause').addEventListener('click', function() {
        AutoRotate(false);
    });
	
	drawScene();
};
function WindowResize()
{
	UpdateCanvasSize();
	drawScene();
}

var timer;
function AutoRotate( param )
{
    if ( param ) {
        timer = setInterval( function() {
                var v = document.getElementById('rotation-speed').value;
                const counter = document.getElementById('counter');
                counter.textContent = `${v} days/sec`;
                autorev += 0.000175 * v; // 1 degree in radiants = 1 day approx
                if ( autorev > 164.79*2*Math.PI ) autorev -= 164.79*2*Math.PI;

                autorot += ((2*Math.PI)/100) * v; // 360 degree in radiants = 1 day 
                if (autorot > 243 * 2 * Math.PI) autorot -= 243 * 2 * Math.PI; 
                drawScene();
            }, 10
        );
        document.getElementById('rotation-speed').disabled = false;
        document.getElementById('pause').disabled = false;
        document.getElementById('play').disabled = true;
        document.getElementById('counter').classList.remove('hide');
    } else {
        clearInterval( timer );
        document.getElementById('rotation-speed').disabled = true;
        document.getElementById('pause').disabled = true;
        document.getElementById('play').disabled = false;
        document.getElementById('counter').classList.add('hide');
    }
}

function getRay(ndcX, ndcY, cameraPosition) {
    const inverseProjectionMatrix = mat4.create();
    mat4.invert(inverseProjectionMatrix, perspectiveMatrix);

    const nearPoint = vec4.fromValues(ndcX, ndcY, -1.0, 1.0);
    const farPoint = vec4.fromValues(ndcX, ndcY, 1.0, 1.0);

    vec4.transformMat4(nearPoint, nearPoint, inverseProjectionMatrix);
    vec4.transformMat4(farPoint, farPoint, inverseProjectionMatrix);

    nearPoint[0] /= nearPoint[3];
    nearPoint[1] /= nearPoint[3];
    nearPoint[2] /= nearPoint[3];

    farPoint[0] /= farPoint[3];
    farPoint[1] /= farPoint[3];
    farPoint[2] /= farPoint[3];

    const rayDirection = vec3.create();
    vec3.sub(rayDirection, vec3.fromValues(farPoint[0], farPoint[1], farPoint[2]), vec3.fromValues(nearPoint[0], nearPoint[1], nearPoint[2]));
    vec3.normalize(rayDirection, rayDirection);

    return {
        origin: cameraPosition,
        direction: rayDirection
    };
}



function checkIntersections(ndcX, ndcY, cameraPosition) {
    const ray = getRay(ndcX, ndcY, cameraPosition);

    for (let planetDrawer of planetDrawers) {
        if (planetDrawer.intersectSphere(ray)) {
            console.log(`Clicked on ${planetDrawer.name}`);
            // Handle click on planet
        }
    }
}


function onMouseClick(event) {
    const mouseX = event.clientX;
    const mouseY = event.clientY;
    const rect = canvas.getBoundingClientRect();

    // Convert mouse position to normalized device coordinates
    const ndcX = ((mouseX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((mouseY - rect.top) / rect.height) * 2 + 1;

    const cameraPosition = vec3.fromValues(0, 0, 0);

    checkIntersections(ndcX, ndcY, cameraPosition);
}

