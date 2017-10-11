/* jshint multistr: true */
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
    description: 'The pattern detection determines the method by which ARToolKit matches detected squares \
                  in the video image to marker templates and/or IDs. ARToolKit can match against pictorial \
                  "template" markers, whose pattern files are created with the mk_patt utility, in either \
                  colour or mono, and additionally can match against 2D-barcode-type "matrix" markers, which \
                  have an embedded marker ID. Two different two-pass modes are also available, in which a \
                  matrix-detection pass is made first, followed by a template-matching pass. Defaults to \
                  "Color Template".'
});
ArCamera.attributes.add('matrixCodeType', { 
    type: 'number', 
    enum: [
        { '3x3': 0 },
        { '3x3 Hamming 63': 1 },
        { '3x3 Parity 65': 2 },
        { '4x4': 3 },
        { '4x4 BCH 13_9_3': 4 },
        { '4x4 BCH 13_5_5': 5 }
    ],
    default: 0,
    title: 'Matrix Code Type',
    description: 'Set the size and ECC algorithm to be used for matrix code (2D barcode) marker detection.\n\n \
                  When matrix-code (2D barcode) marker detection is enabled (see Detection Mode) \
                  then the size of the barcode pattern and the type of error checking and correction (ECC) \
                  with which the markers were produced can be set via this function.\n\n \
                  This setting is global to a given AR Camera; It is not possible to have two different matrix \
                  code types in use at once. Defaults to 3x3.'
});
ArCamera.attributes.add('labelingMode', { 
    type: 'number',
    enum: [
        { 'White Region': 0 },
        { 'Black Region': 1 }
    ],
    default: 1,
    title: 'Labeling Mode',
    description: 'Select between detection of black markers and white markers.\n\nARToolKit\'s labeling \
                  algorithm can work with both black-bordered markers on a white background ("Black Region") \
                  or white-bordered markers on a black background ("White Region"). This property allows \
                  you to specify the type of markers to look for. Note that this does not affect the \
                  pattern-detection algorithm which works on the interior of the marker.'
});
ArCamera.attributes.add('processingMode', { 
    type: 'number', 
    enum: [
        { 'Frame': 0 },
        { 'Field': 1 }
    ],
    default: 0,
    title: 'Processing Mode',
    description: 'When the image processing mode is "Frame", ARToolKit processes all pixels in each incoming \
                  image to locate markers. When the mode is "Field", ARToolKit processes pixels in only every \
                  second pixel row and column. This is useful both for handling images from interlaced video \
                  sources (where alternate lines are assembled from alternate fields and thus have one field \
                  time-difference, resulting in a "comb" effect) such as Digital Video cameras. The effective \
                  reduction by 75% in the pixels processed also has utility in accelerating tracking by \
                  effectively reducing the image size to one quarter size, at the cost of pose accuracy.'
});
ArCamera.attributes.add('thresholdMode', { 
    type: 'number', 
    enum: [
        { 'Manual': 0 },
        { 'Auto Median': 1 },
        { 'Auto Otsu': 2 },
        { 'Auto Adaptive': 3 }
    ],
    default: 0,
    title: 'Threshold Mode',
    description: 'The thresholding mode to use. The standard ARToolKit options are available: Manual, Median, \
                  Otsu, Adaptive, Bracketing.'
});
ArCamera.attributes.add('threshold', {
    type: 'number',
    min: 0,
    max: 255,
    precision: 0,
    default: 100,
    title: 'Threshold',
    description: "Sets the labeling threshhold value. The default value is 100.\n\nThe current threshold mode \
                  is not affected by the setting of this value. Typically, this property is used when the labeling \
                  threshold mode is 'Manual'.\n\nThe threshold value is not relevant if threshold mode is \
                  'Auto Adaptive'.\n\nBackground: The labeling threshold is the value which the AR library uses to \
                  differentiate between black and white portions of an ARToolKit marker. Since the actual brightness, \
                  contrast, and gamma of incoming images can vary signficantly between different cameras and lighting \
                  conditions, this value typically needs to be adjusted dynamically to a suitable midpoint between \
                  the observed values for black and white portions of the markers in the image."
});
ArCamera.attributes.add('trackerResolution', {
    type: 'number',
    enum: [
        { 'Full': 0 },
        { 'Three Quarters': 1 },
        { 'Half': 2 },
        { 'Quarter': 3 }
    ],
    default: 0,
    title: 'Tracker Resolution',
    description: "Controls the resolution of the tracker image. Each video frame is copied to the tracker image for \
                  marker detection. Reducing the tracker image resolution will speed up marker detection but will \
                  also make it less precise. For example, a video camera source may have a resolution of 640x480. \
                  The tracker image will have the following resolutions based on the selected option: 'Full': 640x480, \
                  'Three Quarters': 480x360, 'Half': 320x240, 'Quarter': 160x120."
});
ArCamera.attributes.add('trackAlternateFrames', {
    type: 'boolean',
    default: false,
    title: 'Track Alternate Frames',
    description: 'If selected, tracking is only performed on every other update. This can increase lag in tracking but \
                  will reduce CPU load.'
});
ArCamera.attributes.add('debugOverlay', {
    type: 'boolean',
    default: false,
    title: 'Debug Overlay',
    description: 'Enables or disables the debug overlay. When enabled, a black and white debug image is generated during \
                  marker detection. The debug image is useful for visualizing the binarization process and choosing a \
                  threshold value. The image is displayed as an overlay on top of the 3D scene.'
});
ArCamera.attributes.add('videoTexture', {
    type: 'boolean',
    default: false,
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
    style.zIndex = '0';
    document.body.appendChild(this.video);

    // Z-order for page is:
    //   0: Video DOM element
    //   1: PlayCanvas canvas element
    //   2: ARToolkit debug canvas
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

    this.arController.orientation = (vw < vh) ? 'portrait' : 'landscape';
    if (vw < vh) {
        this.entity.camera.fov = Math.abs(fovy) * (vh / vw);
    } else {
        if (cw / ch > vw / vh) {
            // Video Y FOV is limited so we must limit 3D camera FOV to match
            this.entity.camera.fov = Math.abs(fovy) * (vw / vh) / (cw / ch);
        } else {
            // Video Y FOV is limited so we must limit 3D camera FOV to match
            this.entity.camera.fov = Math.abs(fovy);
        }
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

ArCamera.prototype._setDebugMode = function (mode) {
    if (this.arController) {
        this.arController.setDebugMode(mode);

        var canvas = this.arController.canvas;
        if (mode) {
            canvas.style.position = 'absolute';
            canvas.style.zIndex = '2';
            document.body.appendChild(canvas);

            this.arController._bwpointer = this.arController.getProcessingImage();
        } else {
            if (canvas.parentElement) {
                document.body.removeChild(canvas);
            }

            this.arController._bwpointer = null;
        }
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

ArCamera.prototype._setLabelingMode = function (labelingMode) {
    if (this.arController) {
        switch (labelingMode) {
            case 0:
                this.arController.setLabelingMode(artoolkit.AR_LABELING_WHITE_REGION);
                break;
            case 1:
                this.arController.setLabelingMode(artoolkit.AR_LABELING_BLACK_REGION);
                break;
            default:
                console.error("ERROR: " + labelingMode + " is an invalid labeling mode.");
                break;
        }
    }
};

ArCamera.prototype._setMatrixCodeType = function (matrixCodeType) {
    if (this.arController) {
        switch (matrixCodeType) {
            case 0:
                this.arController.setMatrixCodeType(artoolkit.AR_MATRIX_CODE_3x3);
                break;
            case 1:
                this.arController.setMatrixCodeType(artoolkit.AR_MATRIX_CODE_3x3_HAMMING63);
                break;
            case 2:
                this.arController.setMatrixCodeType(artoolkit.AR_MATRIX_CODE_3x3_PARITY65);
                break;
            case 3:
                this.arController.setMatrixCodeType(artoolkit.AR_MATRIX_CODE_4x4);
                break;
            case 4:
                this.arController.setMatrixCodeType(artoolkit.AR_MATRIX_CODE_4x4_BCH_13_9_3);
                break;
            case 5:
                this.arController.setMatrixCodeType(artoolkit.AR_MATRIX_CODE_4x4_BCH_13_5_5);
                break;
            default:
                console.error("ERROR: " + matrixCodeType + " is an invalid matrix code type.");
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
            default:
                console.error("ERROR: " + thresholdMode + " is an invalid threshold mode.");
                break;
        }
    }
};

ArCamera.prototype._createArController = function (w, h, url) {
    // Load the camera calibration data
    this.cameraParam = new ARCameraParam(url, function () {
        this.arController = new ARController(w * (1 - this.trackerResolution / 4), h * (1 - this.trackerResolution / 4), this.cameraParam);

        // Disable spammy console logging from ARToolkit. See the following for the origin of 4:
        // https://github.com/artoolkit/artoolkit5/blob/master/include/AR/config.h.in#L214
        this.arController.setLogLevel(4);

        this.arController.setProjectionNearPlane(this.entity.camera.nearClip);
        this.arController.setProjectionFarPlane(this.entity.camera.farClip);
        this._setDebugMode(this.debugOverlay);
        this._setImageProcMode(this.processingMode);
        this._setLabelingMode(this.labelingMode);
        this._setMatrixCodeType(this.matrixCodeType);
        this._setPatternDetectionMode(this.detectionMode);
        this._setThreshold(this.threshold);
        this._setThresholdMode(this.thresholdMode);

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

ArCamera.prototype.startTracking = function () {
    var url = this.cameraCalibration.getFileUrl();
    this._createArController(this.video.videoWidth, this.video.videoHeight, url);
};

ArCamera.prototype.stopTracking = function () {
    this._destroyArController();
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
        // This is critical for iOS or the video initially goes fullscreen
        video.setAttribute('playsinline', '');
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
                self.startTracking();
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
                    self.startTracking();
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
    // All markers move with respect to an untransformed camera
    // so ignore whatever transformation has been set up in the Editor
    this.entity.setEulerAngles(0, 0, 0);
    this.entity.setPosition(0, 0, 0);
    this.entity.setLocalScale(1, 1, 1);

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

    this.on('attr:debugOverlay', function (value, prev) {
        this._setDebugMode(value);
    });

    this.on('attr:detectionMode', function (value, prev) {
        this._setPatternDetectionMode(value);
    });

    this.on('attr:labelingMode', function (value, prev) {
        this._setLabelingMode(value);
    });

    this.on('attr:matrixCodeType', function (value, prev) {
        this._setMatrixCodeType(value);
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

    this.on('attr:trackerResolution', function (value, prev) {
        // ARToolkit doesn't seem to support recreation of ArControllers
        // this.stopTracking();
        // this.startTrackinng();
    });

    this.on('attr:videoTexture', function (value, prev) {
        if (value) {
            this.useVideoTexture();
        } else {
            this.useDom();
        }
    });

    this.process = true;
};

// update code called every frame
ArCamera.prototype.update = function(dt) {
    if (this.arController) {
        // Update the tracking
        if (this.trackAlternateFrames) {
            if (this.process) {
                this.arController.process(this.video);
            }
            this.process = !this.process;
       } else {
            this.arController.process(this.video);
       }

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
ArMarker.attributes.add('matrixId', {
    type: 'number',
    default: 0,
    title: 'Matrix ID',
    description: 'The matrix ID. If no pattern template is set, the marker is a matrix. Defaults to 0.'
});
ArMarker.attributes.add('width', {
    type: 'number',
    default: 1,
    title: 'Width',
    description: 'The width of the marker. Defaults to 1.'
});
ArMarker.attributes.add('deactivationTime', {
    type: 'number',
    default: 0.25,
    title: 'Deactivation Time',
    description: 'The time in seconds from when a marker is lost before its children are deactivated. Defaults to 0.25.'
});
ArMarker.attributes.add('shadow', {
    type: 'boolean',
    default: true,
    title: 'Shadow',
    description: 'Enable this option to generate shadows in the plane of the marker that blend with the camera feed. Defaults to true.'
});
ArMarker.attributes.add('shadowStrength', {
    type: 'number',
    default: 0.5,
    min: 0,
    max: 1,
    title: 'Shadow Strength',
    description: 'Control the strength of the shadow. 1 is full strength and 0 is disabled. Defaults to 0.5.'
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
        material.chunks.outputAlphaPS = "gl_FragColor.a = dAlpha * (1.0 - dDiffuseLight.r);";
        material.diffuse.set(0, 0, 0);
        material.specular.set(0, 0, 0);
        material.emissive.set(0, 0, 0);
        material.opacity = this.shadowStrength;
        material.blendType = pc.BLEND_NORMAL;
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
        if (self.pattern) {
            arController.loadMarker(self.pattern.getFileUrl(), function (markerId) {
                self.markerId = markerId;
            });
        }
        arController.addEventListener('getMarker', function (ev) {
            var data = ev.data;
            var type = data.type;
            var marker = data.marker;
            if ((self.pattern && type === artoolkit.PATTERN_MARKER && marker.idPatt === self.markerId) ||
                (!self.pattern && type === artoolkit.BARCODE_MARKER && marker.idMatrix === self.matrixId)) {
                // Set the marker entity position and rotation from ARToolkit
                self.markerMatrix.data.set(data.matrix);
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
            ArMarker.shadowMaterial.opacity = this.shadowStrength;
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