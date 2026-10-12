#include <torch/types.h>
#include <torch/csrc/utils/pybind.h>
#include <c10/cuda/CUDAStream.h>
#include <cuda_runtime.h>
#include "../binding_registry.h"
void launch_square(const float* input, float* output, int64_t count, cudaStream_t stream);
torch::Tensor square_forward(torch::Tensor input) {
    auto output = torch::empty_like(input);
    launch_square(input.data_ptr<float>(), output.data_ptr<float>(), input.numel(), c10::cuda::getCurrentCUDAStream().stream());
    return output;
}
void bind_square(pybind11::module& module) { module.def("square_forward", &square_forward); }
REGISTER_BINDING(square, bind_square);
