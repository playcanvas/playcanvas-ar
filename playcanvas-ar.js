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
ArCamera.attributes.add('detectionMode', { 
    type: 'number', 
    enum: [
        { 'Color Template': 0 },
        { 'Mono Template': 1 },
        { 'Matrix': 2 },
        { 'Color Template and Matrix': 3 },
        { 'Mono Template and Matrix': 4 }
    ],
    default: 0,
    title: 'Detection Mode',
    description: 'The pattern detection determines the method by which ARToolKit matches detected squares in the video image to marker templates and/or IDs. ARToolKit can match against pictorial "template" markers, whose pattern files are created with the mk_patt utility, in either colour or mono, and additionally can match against 2D-barcode-type "matrix" markers, which have an embedded marker ID. Two different two-pass modes are also available, in which a matrix-detection pass is made first, followed by a template-matching pass.'
});
ArCamera.attributes.add('processingMode', { 
    type: 'number', 
    enum: [
        { 'Frame': 0 },
        { 'Field': 1 }
    ],
    default: 0,
    title: 'Processing Mode',
    description: "When the image processing mode is 'Frame', ARToolKit processes all pixels in each incoming image to locate markers. When the mode is 'Field', ARToolKit processes pixels in only every second pixel row and column. This is useful both for handling images from interlaced video sources (where alternate lines are assembled from alternate fields and thus have one field time-difference, resulting in a 'comb' effect) such as Digital Video cameras. The effective reduction by 75% in the pixels processed also has utility in accelerating tracking by effectively reducing the image size to one quarter size, at the cost of pose accuracy."
});
ArCamera.attributes.add('thresholdMode', { 
    type: 'number', 
    enum: [
        { 'Manual': 0 },
        { 'Auto Median': 1 },
        { 'Auto Otsu': 2 },
        { 'Auto Adaptive': 3 },
        { 'Auto Bracketing': 4 }
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
        this.arController.orientation = 'portrait';
    } else {
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

ArCamera.prototype._setImageProcMode = function (procMode) {
    if (this.arController) {
        switch (procMode) {
            case 0:
                this.arController.setImageProcMode(artoolkit.AR_IMAGE_PROC_FRAME_IMAGE);
                break;
            case 1:
                this.arController.setImageProcMode(artoolkit.AR_IMAGE_PROC_FIELD_IMAGE);
                break;
            default:
                console.error("ERROR: " + procMode + " is an invalid image processing mode.");
                break;
        }
    }
};

ArCamera.prototype._setPatternDetectionMode = function (detectionMode) {
    if (this.arController) {
        switch (detectionMode) {
            case 0:
                this.arController.setPatternDetectionMode(artoolkit.AR_TEMPLATE_MATCHING_COLOR);
                break;
            case 1:
                this.arController.setPatternDetectionMode(artoolkit.AR_TEMPLATE_MATCHING_MONO);
                break;
            case 2:
                this.arController.setPatternDetectionMode(artoolkit.AR_MATRIX_CODE_DETECTION);
                break;
            case 3:
                this.arController.setPatternDetectionMode(artoolkit.AR_TEMPLATE_MATCHING_COLOR_AND_MATRIX);
                break;
            case 4:
                this.arController.setPatternDetectionMode(artoolkit.AR_TEMPLATE_MATCHING_MONO_AND_MATRIX);
                break;
            default:
                console.error("ERROR: " + detectionMode + " is an invalid pattern detection mode.");
                break;
        }
    }
};

ArCamera.prototype._setThreshold = function (theshold) {
    if (this.arController) {
        // Clamp to 0..255 and round down to nearest integer
        theshold = Math.floor(Math.min(Math.max(theshold, 0), 255));
        this.arController.setThreshold(theshold);
    }
};

ArCamera.prototype._setThresholdMode = function (thresholdMode) {
    if (this.arController) {
        switch (thresholdMode) {
            case 0:
                this.arController.setThresholdMode(artoolkit.AR_LABELING_THRESH_MODE_MANUAL);
                break;
            case 1:
                this.arController.setThresholdMode(artoolkit.AR_LABELING_THRESH_MODE_AUTO_MEDIAN);
                break;
            case 2:
                this.arController.setThresholdMode(artoolkit.AR_LABELING_THRESH_MODE_AUTO_OTSU);
                break;
            case 3:
                this.arController.setThresholdMode(artoolkit.AR_LABELING_THRESH_MODE_AUTO_ADAPTIVE);
                break;
            case 4:
                this.arController.setThresholdMode(artoolkit.AR_LABELING_THRESH_MODE_AUTO_BRACKETING);
                break;
            default:
                console.error("ERROR: " + thresholdMode + " is an invalid threshold mode.");
                break;
        }
    }
};

ArCamera.prototype._createArController = function (w, h, url) {
    // Load the camera calibration data
    this.cameraParam = new ARCameraParam(url, function () {
        this.arController = new ARController(w, h, this.cameraParam);
        this.arController.setProjectionNearPlane(this.entity.camera.nearClip);
        this.arController.setProjectionFarPlane(this.entity.camera.farClip);
        this._setImageProcMode(this.processingMode);
        this._setPatternDetectionMode(this.detectionMode);
        this._setThresholdMode(this.thresholdMode);
        this._setThreshold(this.threshold);

        this.onResize();

        // Notify all markers that tracking is initialized
        this.app.fire('trackinginitialized', this.arController);
    }.bind(this));
};

ArCamera.prototype._destroyArController = function () {
    // Tear down tracking resources
    if (this.arController) {
        this.arController.dispose();
        this.arController = null;
    }

    if (this.cameraParam) {
        this.cameraParam.dispose();
        this.cameraParam = null;
    }
};

ArCamera.prototype.startTracking = function (w, h) {
    var url = this.cameraCalibration.getFileUrl();
    this._createArController(w, h, url);
};

ArCamera.prototype.supportsAr = function () {
    return (navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
};

ArCamera.prototype.enterAr = function (success, error) {
    if (!this.cameraCalibration) {
        console.error('ERROR: No camera calibration file set on your arCamera script. Try assigning camera_para.dat.');
    }

    var self = this;

    var constraints = {
        audio: false,
        video: {
            // Prefer the rear camera
            facingMode: "environment"
        }
    };

    navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
        self.videoPlaying = false;

        // Create the video element to receive the camera stream
        var video = document.createElement('video');
        video.setAttribute('autoplay', '');
        video.setAttribute('muted', '');
        video.setAttribute('playsinline', ''); // This is critical for iOS or the video initially goes fullscreen
        video.srcObject = stream;
        self.video = video;

        // Check for both video and canvas resizing
        // Changing screen orientation on mobile can change both!
        self.app.graphicsDevice.on('resizecanvas', function () {
            self.onResize();
        });
        video.addEventListener('resize', function () {
            self.onResize();
        });

        // Only play the video when it's actually ready
        video.addEventListener('canplay', function () {
            if (!self.videoPlaying) {
                self.startVideo();
                self.startTracking(video.videoWidth, video.videoHeight);
                self.videoPlaying = true;
                if (success) success();
            }
        });

        // iOS needs a user action to start the video
        if (pc.platform.mobile) {
            window.addEventListener('touchstart', function (e) {
                e.preventDefault();
                if (!self.videoPlaying) {
                    self.startVideo();
                    self.startTracking(video.videoWidth, video.videoHeight);
                    self.videoPlaying = true;
                    if (success) success();
                }
            });
        }
    }).catch(function (e) {
        if (error) error("ERROR: Unable to acquire camera stream");
    });
};

ArCamera.prototype.exitAr = function () {
    // Tear down video resources
    if (this.video) {
        this.video.stop();
        if (this.video.parentElement) {
            document.body.removeChild(this.video);
        }
    }
};

// initialize code called once per entity
ArCamera.prototype.initialize = function () {
    if (this.cameraCalibration) {
        if (this.supportsAr()) {
            this.enterAr();
        }
    } else {
        console.warn("WARNING: Unable to enter AR until a valid camera calibration asset has been set.");
    }

    //////////////////////////////
    // Handle attribute changes //
    //////////////////////////////
    this.on('attr:cameraCalibration', function (value, prev) {
        if (!this.arController && value) {
            if (this.supportsAr()) {
                this.enterAr();
            }
        }
    });

    this.on('attr:detectionMode', function (value, prev) {
        this._setPatternDetectionMode(value);
    });

    this.on('attr:processingMode', function (value, prev) {
        this._setImageProcMode(value);
    });

    this.on('attr:threshold', function (value, prev) {
        this._setThreshold(value);
    });

    this.on('attr:thresholdMode', function (value, prev) {
        this._setThresholdMode(value);
    });

    this.on('attr:videoTexture', function (value, prev) {
        if (value) {
            this.useVideoTexture();
        } else {
            this.useDom();
        }
    });
};

// update code called every frame
ArCamera.prototype.update = function(dt) {
    // All markers move with respect to an untransformed camera
    // so ignore whatever transformation has been set up in the Editor
    this.entity.setEulerAngles(0, 0, 0);
    this.entity.setPosition(0, 0, 0);
    this.entity.setLocalScale(1, 1, 1);

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
    default: 1,
    min: 0,
    max: 1,
    title: 'Shadow Strength',
    description: 'Control the strength of the shadow. 1 is full strength and 0 is disabled.'
});

ArMarker.shadowMaterial = null;

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

// initialize code called once per entity
ArMarker.prototype.initialize = function () {
    var self = this;
    var entity = this.entity;

    this.active = false;
    this.markerId = -1;
    this.markerMatrix = new pc.Mat4();
    this.portraitRot = new pc.Mat4();
    this.portraitRot.setFromEulerAngles(180, 0, 90);
    this.portraitRot.invert();
    this.landscapeRot = new pc.Mat4();
    this.landscapeRot.setFromEulerAngles(180, 0, 0);
    this.landscapeRot.invert();
    this.finalMatrix = new pc.Mat4();

    this.lastSeen = -1;

    this.app.on('trackinginitialized', function (arController) {
        arController.loadMarker(self.pattern.getFileUrl(), function (markerId) {
            self.markerId = markerId;
        });
        arController.addEventListener('getMarker', function (ev) {
            if (ev.data.type === artoolkit.PATTERN_MARKER && ev.data.marker.idPatt === self.markerId) {
                // Set the marker entity position and rotat ion from ARToolkit
                self.markerMatrix.data.set(ev.data.matrix);
                if (arController.orientation === 'portrait') {
                    self.finalMatrix.mul2(self.portraitRot, self.markerMatrix);
                } else {
                    self.finalMatrix.mul2(self.landscapeRot, self.markerMatrix);
                }
                entity.setPosition(self.finalMatrix.getTranslation());
                entity.setEulerAngles(self.finalMatrix.getEulerAngles());

                if (self.width > 0)
                    entity.setLocalScale(1 / self.width, 1 / self.width, 1 / self.width);

                // Z points upwards from an ARToolkit marker so rotate it so Y is up
                entity.rotateLocal(90, 0, 0);

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

    //////////////////////////////
    // Handle attribute changes //
    //////////////////////////////
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