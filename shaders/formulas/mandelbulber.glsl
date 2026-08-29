// ============================================================================
// Mandelbulber-style 3D fractal distance estimators, in WebGL1 / GLSL ES 1.0.
//
// Ports of formulas from Mandelbulber v2's formula set. Each function is named
// after the Mandelbulber formula it implements, so a preset there translates
// here by matching names and parameters.
//
// HOW TO USE THIS FILE
// Library shaders are stored self-contained so they stay drop-in for Shadertoy,
// TouchDesigner, ISF and Resolume. So this file is a source to copy from, not a
// module to include: paste the estimator you need plus the raymarch helpers into
// your shader. Duplication here is deliberate — portability is the point.
//
// DISTANCE ESTIMATORS
// Every deXxx() returns a lower bound on the distance from p to the fractal
// surface, which is what lets a ray march safely. Escape-time fractals use the
// Hubbard-Douady potential, DE = 0.5 * log(r) * r / dr, tracking the running
// derivative dr; folding fractals (Mandelbox, Menger, Sierpinski) instead track
// the accumulated scale factor.
//
// CONVENTIONS
// - Loop bounds are compile-time constants: GLSL ES 1.0 requires it.
// - Estimators are conservative. If you raise an iteration count, shorten the
//   step (see DE_SAFETY) or the march will punch through thin structure.
// - Orbit traps are returned through an inout vec4: xyz accumulate the closest
//   approach per axis, w the closest approach to the origin. This is where the
//   colour comes from — Mandelbulber does the same thing.
// ============================================================================

// Step size multiplier. Below 1.0 to stay conservative on folding formulas,
// whose estimators overestimate near creases.
#define DE_SAFETY 0.85

// ---------------------------------------------------------------------------
// Orbit traps — call once per iteration to collect colouring data.
// ---------------------------------------------------------------------------
void orbitTrap(vec3 z, inout vec4 trap){
    trap = min(trap, vec4(abs(z), dot(z, z)));
}

// ---------------------------------------------------------------------------
// mandelbulb — Mandelbulber "mandelbulb".
// The classic White/Nylander power-8 bulb: raise z to a power in spherical
// coordinates and add the seed. power 8.0 is canonical; animating it between
// roughly 3.0 and 12.0 is stable.
// ---------------------------------------------------------------------------
float deMandelbulb(vec3 pos, float power, inout vec4 trap){
    vec3 z = pos;
    float dr = 1.0;
    float r = length(z);
    for (int i = 0; i < 8; i++){
        r = length(z);
        if (r > 2.0) break;
        orbitTrap(z, trap);
        // Derivative of z^power, needed for the distance estimate.
        dr = pow(r, power - 1.0) * power * dr + 1.0;
        float theta = acos(clamp(z.z / r, -1.0, 1.0));
        float phi = atan(z.y, z.x);
        float zr = pow(r, power);
        theta *= power;
        phi *= power;
        z = zr * vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta)) + pos;
    }
    // max() guards log(0) at the exact origin, which would return NaN and stall
    // the march.
    return 0.5 * log(max(r, 1e-6)) * r / dr;
}

// ---------------------------------------------------------------------------
// mandelbox — Mandelbulber "mandelbox" (Tglad's formula).
// A box fold followed by a sphere fold, then a scale. Negative scale values
// give the hollow, cathedral-like interiors; scale 2.0 is the solid classic.
// ---------------------------------------------------------------------------
void boxFold(inout vec3 z, float limit){
    z = clamp(z, -limit, limit) * 2.0 - z;
}

void sphereFold(inout vec3 z, inout float dz, float minR2, float fixedR2){
    float r2 = dot(z, z);
    if (r2 < minR2){
        float t = fixedR2 / minR2;      // inside the inner sphere: linear blow-up
        z *= t; dz *= t;
    } else if (r2 < fixedR2){
        float t = fixedR2 / r2;         // inversion in the shell
        z *= t; dz *= t;
    }
}

float deMandelbox(vec3 pos, float scale, inout vec4 trap){
    vec3 z = pos;
    float dr = 1.0;
    for (int i = 0; i < 11; i++){
        boxFold(z, 1.0);
        sphereFold(z, dr, 0.25, 1.0);
        z = scale * z + pos;
        dr = dr * abs(scale) + 1.0;
        orbitTrap(z, trap);
    }
    return length(z) / abs(dr);
}

// ---------------------------------------------------------------------------
// menger_sponge — Mandelbulber "menger_sponge".
// Fold into the sorted positive octant, scale by 3, cut the middle cross.
// ---------------------------------------------------------------------------
float deMenger(vec3 z, inout vec4 trap){
    float scale = 3.0;
    for (int n = 0; n < 5; n++){
        z = abs(z);
        // Sort the components so one fold covers all octants.
        if (z.x < z.y) z.xy = z.yx;
        if (z.x < z.z) z.xz = z.zx;
        if (z.y < z.z) z.yz = z.zy;
        orbitTrap(z, trap);
        z = z * scale - vec3(scale - 1.0, scale - 1.0, 0.0);
        if (z.z < -0.5 * (scale - 1.0)) z.z += (scale - 1.0);
    }
    vec3 d = abs(z) - vec3(1.0);
    float box = min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
    return box * pow(scale, -5.0);
}

// ---------------------------------------------------------------------------
// sierpinski3d — Mandelbulber "sierpinski3d", the kaleidoscopic IFS tetrahedron.
// ---------------------------------------------------------------------------
float deSierpinski(vec3 z, float scale, inout vec4 trap){
    for (int n = 0; n < 9; n++){
        // Reflect across the three tetrahedral planes.
        if (z.x + z.y < 0.0) z.xy = -z.yx;
        if (z.x + z.z < 0.0) z.xz = -z.zx;
        if (z.y + z.z < 0.0) z.yz = -z.zy;
        orbitTrap(z, trap);
        z = z * scale - vec3(scale - 1.0);
    }
    return length(z) * pow(scale, -9.0);
}

// ---------------------------------------------------------------------------
// amazing_surf — Mandelbulber "amazing_surf".
// Mandelbox with the box fold applied on x and y only, which opens the z axis
// into wide sheeted surfaces instead of a closed box.
// ---------------------------------------------------------------------------
float deAmazingSurf(vec3 pos, float scale, inout vec4 trap){
    vec3 z = pos;
    float dr = 1.0;
    for (int i = 0; i < 10; i++){
        z.xy = clamp(z.xy, -1.0, 1.0) * 2.0 - z.xy;
        float r2 = dot(z, z);
        float t = clamp(1.0 / r2, 1.0, 4.0);
        z *= t; dr *= t;
        z = z * scale + pos;
        dr = dr * abs(scale) + 1.0;
        orbitTrap(z, trap);
    }
    return length(z) / abs(dr);
}

// ---------------------------------------------------------------------------
// quaternion — Mandelbulber "quaternion", the quaternion Julia set.
// c is the Julia seed; small changes to it reshape the whole solid.
// ---------------------------------------------------------------------------
vec4 qSquare(vec4 a){
    return vec4(a.x * a.x - dot(a.yzw, a.yzw), 2.0 * a.x * a.yzw);
}

float deQuaternion(vec3 pos, vec4 c, inout vec4 trap){
    vec4 z = vec4(pos, 0.0);
    float md2 = 1.0;            // running |dz|^2
    float mz2 = dot(z, z);
    for (int i = 0; i < 9; i++){
        if (mz2 > 4.0) break;
        orbitTrap(z.xyz, trap);
        md2 *= 4.0 * mz2;       // |2z|^2
        z = qSquare(z) + c;
        mz2 = dot(z, z);
    }
    return 0.25 * sqrt(mz2 / md2) * log(max(mz2, 1e-6));
}

// ---------------------------------------------------------------------------
// bristorbrot — Mandelbulber "bristorbrot".
// A 3D escape-time formula with no trig at all, so it is much cheaper than the
// bulb; gives lobed, coral-like solids.
// ---------------------------------------------------------------------------
float deBristorbrot(vec3 pos, inout vec4 trap){
    vec3 z = pos;
    float dr = 1.0;
    float r = length(z);
    for (int i = 0; i < 9; i++){
        r = length(z);
        if (r > 2.5) break;
        orbitTrap(z, trap);
        dr = 2.0 * r * dr + 1.0;
        z = vec3(z.x * z.x - z.y * z.y - z.z * z.z,
                 z.y * (2.0 * z.x - z.z),
                 z.z * (2.0 * z.x + z.y)) + pos;
    }
    return 0.5 * log(max(r, 1e-6)) * r / dr;
}

// ---------------------------------------------------------------------------
// Shared raymarching helpers.
// Swap deScene() for whichever estimator you are using.
// ---------------------------------------------------------------------------

// Surface normal by tetrahedral sampling. Deliberately not dFdx/dFdy: screen
// derivatives need an extension WebGL1 does not guarantee.
vec3 calcNormal(vec3 p, float eps){
    vec2 k = vec2(1.0, -1.0);
    vec4 t = vec4(1e6);
    return normalize(
        k.xyy * deMandelbulb(p + k.xyy * eps, 8.0, t) +
        k.yyx * deMandelbulb(p + k.yyx * eps, 8.0, t) +
        k.yxy * deMandelbulb(p + k.yxy * eps, 8.0, t) +
        k.xxx * deMandelbulb(p + k.xxx * eps, 8.0, t));
}

// Camera basis from an eye and a target.
mat3 lookAt(vec3 eye, vec3 target, float roll){
    vec3 f = normalize(target - eye);
    vec3 up = vec3(sin(roll), cos(roll), 0.0);
    vec3 r = normalize(cross(f, up));
    return mat3(r, cross(r, f), f);
}
