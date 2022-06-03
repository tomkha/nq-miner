{
  'targets': [{
    'target_name': 'nimiq_miner_cuda',
    'sources': [
      'src/native/cuda/argon2d.cu',
      'src/native/cuda/blake2b.cu',
      'src/native/cuda/kernels.cu',
      'src/native/cuda/miner.cc'
    ],
    'include_dirs': [
      '<!(node -e "require(\'nan\')")'
    ],
    'rules': [{
      'extension': 'cu',
      'inputs': ['<(RULE_INPUT_PATH)'],
      'outputs':[ '<(INTERMEDIATE_DIR)/<(RULE_INPUT_ROOT).o'],
      'rule_name': 'CUDA compiler',
      'conditions': [
        ['OS=="win"', {
            'process_outputs_as_sources': 0,
            'action': [
              'nvcc', '-c', '-O3',
              '--default-stream=per-thread',
              '-o', '<@(_outputs)', '<@(_inputs)'
            ]
          }, {
            'process_outputs_as_sources': 1,
            'action': [
              'nvcc', '--std=c++14', '-Xcompiler', '-fpic', '-c', '-O3',
              '--default-stream=per-thread',
              '-o', '<@(_outputs)', '<@(_inputs)'
            ]
          }
        ]]
    }],
    'conditions': [
      ['OS=="win"', {
        'variables': {
          'CUDA_PATH': '<!(echo %CUDA_PATH%)'
        },
        'include_dirs': [
          '<(CUDA_PATH)/include'
        ],
        'libraries': [
          '-lcuda', '-lcudart_static',
          '<(module_root_dir)/build/Release/obj/nimiq_miner_cuda/argon2d.o',
          '<(module_root_dir)/build/Release/obj/nimiq_miner_cuda/blake2b.o',
          '<(module_root_dir)/build/Release/obj/nimiq_miner_cuda/kernels.o'
        ],
        'library_dirs': [
          '<(CUDA_PATH)/lib/x64'
        ],
        'defines': [
          'VC_EXTRALEAN'
        ],
        'cflags_cc': ['-Wall', '-O3', '-fexceptions']
      }],
      ['OS=="linux"', {
        'variables': {
          'CUDA_PATH': '<!(echo $CUDA_PATH)'
        },
        'include_dirs': [
          '<(CUDA_PATH)/include'
        ],
        'libraries': [
          '-lcuda', '-lcudart_static'
        ],
        'library_dirs': [
          '<(CUDA_PATH)/lib64'
        ],
        'cflags_cc': ['-Wall', '-std=c++14', '-O3', '-fexceptions']
      }],
    ]
  }, {
    'target_name': 'nimiq_miner_opencl',
    'sources': [
      'src/native/opencl/miner.cc'
    ],
    'include_dirs': [
      '<!(node -e "require(\'nan\')")'
    ],
    'conditions': [
      ['OS=="win"', {
        'variables': {
          'CUDA_PATH': '<!(echo %CUDA_PATH%)'
        },
        'include_dirs': [
          '<(CUDA_PATH)/include'
        ],
        'libraries': [
          '-lOpenCL'
        ],
        'library_dirs': [
          '<(CUDA_PATH)/lib/x64'
        ],
        'defines': [
          'VC_EXTRALEAN'
        ],
        'cflags_cc': ['-Wall', '-O3', '-fexceptions']
      }],
      ['OS=="linux"', {
        'variables': {
          'CUDA_PATH': '<!(echo $CUDA_PATH)'
        },
        'include_dirs': [
          '<(CUDA_PATH)/include'
        ],
        'libraries': [
          '-lOpenCL'
        ],
        'library_dirs': [
          '<(CUDA_PATH)/lib64'
        ],
        'cflags_cc': ['-Wall', '-std=c++14', '-O3', '-fexceptions']
      }],
    ]
  }]
}
