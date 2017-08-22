///////////////////////////////////////////////////////////////////////////////
////////////////////////////////// AR CAMERA //////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
var ArCamera = pc.createScript('arCamera');

ArCamera.attributes.add('cameraCalibration', { 
    type: 'asset',
    assetType: 'binary',
    title: 'Calibration File',
    description: 'Data file containing the calibration properties for the camera to be used'
});
ArCamera.attributes.add('thresholdMode', { 
    type: 'number', 
    enum: [
        { 'Manual': 0 },
        { 'Median': 1 },
        { 'Otsu': 2 },
        { 'Adaptive': 3 }
    ],
    default: 0,
    title: 'Threshold Mode',
    description: 'The thresholding mode to use. The standard ARToolKit options are available: Manual, Median, Otsu, Adaptive.'
});
ArCamera.attributes.add('threshold', {
    type: 'number',
    min: 0,
    max: 255,
    precision: 0,
    default: 100,
    title: 'Threshold',
    description: 'The binarization threshold is an 8-bit number that is in the range [0, 255], inclusive. The default value is 100, allowing ARToolKit to easily find markers in images that have good contrast. This value is only used when the mode is set to Manual.'
});
ArCamera.attributes.add('videoTexture', {
    type: 'boolean',
    default: true,
    title: 'Video Texture',
    description: 'Streams the camera feed to a video texture if enabled. Otherwise, a video DOM element is used.'
});

ArCamera.prototype.useDom = function () {
    if  (this.entity.model) {
        this.entity.removeComponent('model');
    }

    // Create a video element that is full tab and centered
    // CCS taken from: https://slicejack.com/fullscreen-html5-video-background-css/
    var style = this.video.style;
    style.position = 'absolute';
    style.top = '50%';
    style.left = '50%';
    style.width = 'auto';
    style.height = 'auto';
    style.minWidth = '100%';
    style.minHeight = '100%';
    style.backgroundSize = 'cover';
    style.overflow = 'hidden';
    style.transform = 'translate(-50%, -50%)';

    document.body.appendChild(this.video);

    this.app.graphicsDevice.canvas.style.zIndex = '1';
};

// MEGA HACK FOR IOS
// The video pauses when exiting fullscreen if the video element is not added to the DOM
ArCamera.prototype.addVideoToDom = function () {
    var style = this.video.style;
    style.position = 'absolute';
    style.width = '1%';
    style.height = '1%';

    document.body.appendChild(this.video);
};

ArCamera.prototype.useVideoTexture = function () {
    // If the video is already in the DOM, remove it
    if (this.video.parentElement)
        document.body.removeChild(this.video);

    var device = this.app.graphicsDevice;

    // Create a texture to receive video frames. 888 format seems to achieve best performance.
    this.texture = new pc.Texture(device, {
        format: pc.PIXELFORMAT_R8_G8_B8
    });
    // Apply a linear filter to avoid pixelation of low resolution video
    this.texture.magFilter = pc.FILTER_LINEAR;
    this.texture.minFilter = pc.FILTER_LINEAR;
    this.texture.setSource(this.video);

    var shader = new pc.Shader(device, {
        attributes: {
            aPosition: pc.SEMANTIC_POSITION
        },
        vshader: [
            "attribute vec2 aPosition;",
            "",
            "uniform vec2 uCanvasSize;",
            "uniform vec2 uVideoSize;",
            "",
            "varying vec2 vUv0;",
            "",
            "void main(void)",
            "{",
            "    vUv0 = aPosition;",
            "    float vw = uVideoSize.x;",
            "    float vh = uVideoSize.y;",
            "    float va = uVideoSize.x / uVideoSize.y;",
            "    float cw = uCanvasSize.x;",
            "    float ch = uCanvasSize.y;",
            "    float ca = uCanvasSize.x / uCanvasSize.y;",
            "    if (ca < va)",
            "    {",
            "        vUv0.x *= ca / va;",
            "    }",
            "    else",
            "    {",
            "        vUv0.y *= va / ca;",
            "    }",
            "    vUv0 *= 0.5;",
            "    vUv0 += 0.5;",
            "    gl_Position = vec4(aPosition, 1.0, 1.0);",
            "}"
        ].join("\n"),
        fshader: [
            "precision " + device.precision + " float;",
            "",
            "varying vec2 vUv0;",
            "",
            "uniform sampler2D uVideoMap;",
            "",
            "void main(void)",
            "{",
            "    gl_FragColor = texture2D(uVideoMap, vUv0);",
            "}"
        ].join("\n")
    });

    // Create the vertex format
    var vertexFormat = new pc.VertexFormat(device, [
        { 
            semantic: pc.SEMANTIC_POSITION,
            components: 2,
            type: pc.ELEMENTTYPE_FLOAT32
        }
    ]);

    // Create a vertex buffer
    var vertexBuffer = new pc.VertexBuffer(device, vertexFormat, 4);

    // Fill the vertex buffer
    var vertexData = vertexBuffer.lock();
    var vertexDataF32 = new Float32Array(vertexData);
    vertexDataF32.set([-1, -1, 1, -1, -1, 1, 1, 1]);
    vertexBuffer.unlock();
    
    var mesh = new pc.Mesh();
    mesh.vertexBuffer = vertexBuffer;
    mesh.primitive[0] = {
        type: pc.PRIMITIVE_TRISTRIP,
        base: 0,
        count: 4,
        indexed: false
    };
    
    var material = new pc.Material();
    material.shader = shader;
    material.depthTest = false;
    material.depthWrite = false;
    material.setParameter('uVideoMap', this.texture);
    var cw = device.width;
    var ch = device.height;
    var vw = this.video.videoWidth;
    var vh = this.video.videoHeight;
    material.setParameter('uVideoSize', new Float32Array([vw, vh]));
    material.setParameter('uCanvasSize', new Float32Array([cw, ch]));

    var node = new pc.GraphNode();

    var meshInstance = new pc.MeshInstance(node, mesh, material);

    var model = new pc.Model();
    model.graph = node;
    model.meshInstances = [ meshInstance ];

    this.entity.addComponent('model', {
        type: 'asset',
        castShadows: false
    });
    this.entity.model.model = model;
};

ArCamera.prototype.onResize = function () {
    if (!this.arController) return;
    
    var device = this.app.graphicsDevice;
    var cw = device.width;
    var ch = device.height;
    var vw = this.video.videoWidth;
    var vh = this.video.videoHeight;

    // Resize the video texture
    if (this.entity.model && this.entity.model.model) {
        var material = this.entity.model.model.meshInstances[0].material;
        material.setParameter('uVideoSize', new Float32Array([vw, vh]));
        material.setParameter('uCanvasSize', new Float32Array([cw, ch]));
    }

    // Resize the 3D camera frustum (via the fov)
    var camMatrix = this.arController.getCameraMatrix();
    var fovy = 2 * Math.atan(1 / camMatrix[5]) * 180 / Math.PI;

    if (cw / ch > vw / vh) {
        // Video Y FOV is limited so we must limit 3D camera FOV to match
        this.entity.camera.fov = Math.abs(fovy) * (vw / vh) / (cw / ch);
    } else {
        // Use AR Toolkit's Y FOV directly
        this.entity.camera.fov = Math.abs(fovy);
    }

    if (vw < vh) {
        this.entity.setEulerAngles(0, 180, 270);
        this.arController.orientation = 'portrait';
    } else {
        this.entity.setEulerAngles(0, 180, 180);
        this.arController.orientation = 'landscape';
    }
};

ArCamera.prototype.startVideo = function () {
    if (this.videoTexture) {
        this.useVideoTexture();

        // NASTY NASTY HACK
        if (pc.platform.ios)
            this.addVideoToDom();
    } else {
        this.useDom();
    }
};

ArCamera.prototype.startTracking = function (w, h) {
    if (!this.cameraCalibration) {
        console.error('ERROR: No camera calibration file set on your arCamera script. Try assigning camera_para.dat.');
    }

    // Load the camera calibration data
    var url = this.cameraCalibration.getFileUrl();
    this.cameraParam = new ARCameraParam(url, function () {
        // Create a new AR controller, ensuring width is always greather than height
        this.arController = new ARController(w, h, this.cameraParam);
        this.arController.setProjectionNearPlane(this.entity.camera.nearClip);
        this.arController.setProjectionFarPlane(this.entity.camera.farClip);
        this.arController.setThreshold(Math.floor(this.threshold));
        this.arController.setThresholdMode(this.thresholdModes[this.thresholdMode]);

        this.onResize();

        // Notify all markers that tracking is initialized
        this.app.fire('trackinginitialized', this.arController);
    }.bind(this));
};

// initialize code called once per entity
ArCamera.prototype.initialize = function () {
    var self = this;

    // All markers move with respect to an untransformed camera
    // so ignore whatever transformation has been set up in the Editor
    this.entity.setEulerAngles(0, 0, 0);
    this.entity.setPosition(0, 0, 0);
    this.entity.setLocalScale(1, 1, 1);

    // Create the video element to receive the camera stream
    var video = document.createElement('video');
    video.setAttribute('autoplay', '');
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', ''); // This is critical for iOS or the video initially goes fullscreen

    // Check for both video and canvas resizing
    // Changing screen orientation on mobile can change both!
    video.addEventListener('resize', function () {
        self.onResize();
    });
    this.app.graphicsDevice.on('resizecanvas', function () {
        self.onResize();
    });
    
    this.video = video;
    this.videoPlaying = false;

    var constraints = {
        audio: false,
        video: {
            // Prefer the rear camera
            facingMode: "environment"
        }
    };

    navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
        video.srcObject = stream;

        if (pc.platform.mobile) {
            // iOS needs a user action to start the video
            window.addEventListener('touchstart', function (e) {
                e.preventDefault();
                if (!self.videoPlaying) {
                    self.startVideo();
                    self.startTracking(self.video.videoWidth, self.video.videoHeight);
                    self.videoPlaying = true;
                }
            }, true);
        } else {
            // Only play the video when it's actually ready
            video.addEventListener('canplay', function () {
                if (!self.videoPlaying) {
                    self.startVideo();
                    self.startTracking(self.video.videoWidth, self.video.videoHeight);
                    self.videoPlaying = true;
                }
            });
        }
    }).catch(function (e) {
        console.error("ERROR: Unable to acquire camera stream", e);
    });

    // Handle attribute changes from Editor
    this.thresholdModes = [
        artoolkit.AR_LABELING_THRESH_MODE_MANUAL,
        artoolkit.AR_LABELING_THRESH_MODE_AUTO_MEDIAN,
        artoolkit.AR_LABELING_THRESH_MODE_AUTO_OTSU,
        artoolkit.AR_LABELING_THRESH_MODE_AUTO_ADAPTIVE
    ];    

    this.on('attr:videoTexture', function (value, prev) {
        if (value) {
            this.useVideoTexture();
        } else {
            this.useDom();
        }
    });

    this.on('attr:threshold', function (value, prev) {
        if (this.arController)
            this.arController.setThreshold(Math.floor(value));
    });

    this.on('attr:thresholdMode', function (value, prev) {
        if (this.arController)
            this.arController.setThresholdMode(this.thresholdModes[value]);
    });
};

// update code called every frame
ArCamera.prototype.update = function(dt) {
    if (this.arController) {
        // Update the tracking
        this.arController.process(this.video);

        // If we're displaying video via a texture, copy the video frame into the texture
        if (this.videoTexture && this.texture) {
            this.texture.upload();
        }
    }
};


///////////////////////////////////////////////////////////////////////////////
////////////////////////////////// AR MARKER //////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
var ArMarker = pc.createScript('arMarker');

ArMarker.attributes.add('pattern', {
    type: 'asset',
    assetType: 'binary',
    title: 'Pattern',
    description: 'The marker pattern to track. This can be the Hiro or Kanji markers or a marker you have generated yourself.'
});
ArMarker.attributes.add('width', {
    type: 'number',
    default: 1,
    title: 'Width',
    description: 'The width of the marker'
});
ArMarker.attributes.add('deactivationTime', {
    type: 'number',
    default: 0.25,
    title: 'Deactivation Time',
    description: 'The time in seconds from when a marker is lost before its children are deactivated.'
});
ArMarker.attributes.add('shadow', {
    type: 'boolean',
    default: true,
    title: 'Shadow',
    description: 'Enable this option to generate shadows in the plane of the marker that blend with the camera feed.'
});
ArMarker.attributes.add('shadowStrength', {
    type: 'number',
    default: 0.5,
    min: 0,
    max: 1,
    title: 'Shadow Strength',
    description: 'Control the strength of the shadow. 1 is full strength and 0 is disabled.'
});

ArMarker.shadowMaterial = null;
ArMarker.mask = 1;

ArMarker.prototype.hideChildren = function () {
    for (var i = 0; i < this.entity.children.length; i++) {
        this.entity.children[i].enabled = false;
    }
};

ArMarker.prototype.showChildren = function () {
    for (var i = 0; i < this.entity.children.length; i++) {
        this.entity.children[i].enabled = true;
    }
};

ArMarker.prototype.createShadow = function () {
    if (!ArMarker.shadowMaterial) {
        var material = new pc.StandardMaterial();
        material.chunks.lightDiffuseLambertPS = "float getLightDiffuse() { return 1.0; }";
        material.diffuse.set(1, 1, 1);
        material.specular.set(0, 0, 0);
        material.emissive.set(1 - this.shadowStrength, 1 - this.shadowStrength, 1 - this.shadowStrength);
        material.blendType = pc.BLEND_MULTIPLICATIVE;
        material.useGammaTonemap = false;
        material.useFog = false;
        material.useSkybox = false;
        material.depthWrite = false;
        material.update();
        
        ArMarker.shadowMaterial = material;
    }
    
    this.shadowEntity = new pc.Entity('Shadow');
    this.shadowEntity.addComponent('model', {
        type: 'plane',
        castShadows: false
    });
    this.shadowEntity.model.material = ArMarker.shadowMaterial;
    this.shadowEntity.setLocalScale(5, 5, 5);

    this.entity.addChild(this.shadowEntity);
};

ArMarker.prototype.destroyShadow = function () {
    if (this.shadowEntity) {
        this.entity.removeChild(this.shadowEntity);
        this.shadowEntity.destroy();
        this.shadowEntity = null;
    }
};

ArMarker.prototype.setMask = function (entity) {
    var i;

    if (entity.model) {
        var meshInstances = entity.model.meshInstances;
        for (i = 0; i < meshInstances.length; i++) {
            meshInstances[i].mask = ArMarker.mask;
        }
    }
    
    if (entity.light) {
        entity.light.mask = ArMarker.mask;
    }

    for (i = 0; i < entity.children.length; i++) {
        this.setMask(entity.children[i]);
    }
};

// initialize code called once per entity
ArMarker.prototype.initialize = function () {
    var self = this;
    var entity = this.entity;

    this.active = false;
    this.markerId = -1;
    this.markerMatrix = new pc.Mat4();
    this.cameraRot = new pc.Mat4();
    this.cameraRot.setFromEulerAngles(180, 0, 0);
    this.cameraRot.invert();
    this.finalMatrix = new pc.Mat4();
    
    this.lastSeen = -1;

    this.app.on('trackinginitialized', function (arController) {
        arController.loadMarker(self.pattern.getFileUrl(), function (markerId) {
            self.markerId = markerId;
        });
        arController.addEventListener('getMarker', function (ev) {
            if (ev.data.type === artoolkit.PATTERN_MARKER && ev.data.marker.idPatt === self.markerId) {
                // Set the marker entity position and rotation from ARToolkit
                self.markerMatrix.data.set(ev.data.matrix);
                self.finalMatrix.mul2(self.markerMatrix, self.cameraRot);
                entity.setPosition(self.finalMatrix.getTranslation());
                entity.setEulerAngles(self.finalMatrix.getEulerAngles());

                if (self.width > 0)
                    entity.setLocalScale(1 / self.width, 1 / self.width, 1 / self.width);

                // Z points upwards from an ARToolkit marker so rotate it so Y is up
                entity.rotateLocal(-90, 0, 0);

                self.lastSeen = Date.now();
                if (!self.active) {
                    self.showChildren();
                    self.active = true;
                }
            }
        });
    });

    if (this.shadow) {
        this.createShadow();
    }

    // Associate all lights and models below this specific marker
    this.setMask(this.entity);
    ArMarker.mask = ArMarker.mask << 1;

    this.on('attr:shadow', function (value, prev) {
        if (value)
            this.createShadow();
        else
            this.destroyShadow();
    });

    this.on('attr:shadowStrength', function (value, prev) {
        if (ArMarker.shadowMaterial) {
            ArMarker.shadowMaterial.emissive.set(1 - value, 1 - value, 1 - value);
            ArMarker.shadowMaterial.update();
        }
    });

    this.hideChildren();
};

// update code called every frame
ArMarker.prototype.update = function(dt) {
    if (this.active) {
        var timeSinceLastSeen = (Date.now() - this.lastSeen) / 1000;

        if (timeSinceLastSeen > this.deactivationTime) {
            this.hideChildren();
            this.active = false;
        }
    }
};