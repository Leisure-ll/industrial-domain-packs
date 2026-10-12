#include <cuda_runtime.h>
#include <cstdint>
__global__ void square_kernel(const float* input, float* output, int64_t count) {
    int64_t index = blockIdx.x * blockDim.x + threadIdx.x;
    if (index < count) output[index] = input[index] * input[index] + 1.0f;
}
void launch_square(const float* input, float* output, int64_t count, cudaStream_t stream) {
    square_kernel<<<(count + 255) / 256, 256, 0, stream>>>(input, output, count);
}
