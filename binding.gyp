{
  'targets': [{
    'target_name': 'nimiq_miner_cuda',
    'sources': [
      'src/native/cuda/argon2d.cu',
      'src/native/cuda/blake2b.cu',
      'src/native/cuda/kernels.cu',
      'src/native/cuda/miner.cc'
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
              'nvcc', '--std=c++11', '-c', '-O3',
              '--default-stream=per-thread',
              '--generate-code=arch=compute_35,code=sm_35',
              '--generate-code=arch=compute_35,code=compute_35',
              '--generate-code=arch=compute_61,code=sm_61',
              '--generate-code=arch=compute_61,code=compute_61',
              '--generate-code=arch=compute_75,code=sm_75',
              '--generate-code=arch=compute_75,code=compute_75',
              '-o', '<@(_outputs)', '<@(_inputs)'
            ]
          }, {
            'process_outputs_as_sources': 1,
            'action': [
              'nvcc', '--std=c++11', '-Xcompiler', '-fpic', '-c', '-O3',
              '--default-stream=per-thread',
              '--generate-code=arch=compute_35,code=sm_35',
              '--generate-code=arch=compute_35,code=compute_35',
              '--generate-code=arch=compute_61,code=sm_61',
              '--generate-code=arch=compute_61,code=compute_61',
              '--generate-code=arch=compute_75,code=sm_75',
              '--generate-code=arch=compute_75,code=compute_75',
              '-o', '<@(_outputs)', '<@(_inputs)'
            ]
          }
        ]]
    }],
    'include_dirs': [
      '<!(node -e "require(\'nan\')")',
      '/usr/local/cuda/include'
    ],
    'libraries': [
      '-lcuda', '-lcudart_static'
    ],
    'library_dirs': [
      '/usr/local/cuda/lib64'
    ],
    'cflags_cc': ['-Wall', '-std=c++11', '-O3', '-fexceptions']
  }, {
    'target_name': 'nimiq_miner_opencl',
    'sources': [
      'src/native/opencl/miner.cc'
    ],
    'include_dirs': [
      '<!(node -e "require(\'nan\')")',
      'src/native'
    ],
    'conditions': [
      ['OS in "linux freebsd openbsd"', {
        'variables': {
          'OPENCL_SDK': '<!(echo $AMDAPPSDKROOT)',
          'OPENCL_SDK_INCLUDE': '<(OPENCL_SDK)/include',
          'OPENCL_SDK_LIB': '<(OPENCL_SDK)/lib/x86_64'
        },
        'include_dirs': [
          '<(OPENCL_SDK_INCLUDE)'
        ],
        'libraries': [
          '-L<(OPENCL_SDK_LIB)',
          '-lOpenCL'
        ],
        'cflags_cc': ['-Wall', '-O3', '-fexceptions']
      }],
      ['OS=="win"', {
        'variables': {
          'AMD_OPENCL_SDK': '<!(echo %AMDAPPSDKROOT%)',
          'AMD_OPENCL_SDK_INCLUDE': '<(AMD_OPENCL_SDK)\\include',
          'AMD_OPENCL_SDK_LIB': '<(AMD_OPENCL_SDK)\\lib\\x86_64'
        },
        'include_dirs': [
          '<(AMD_OPENCL_SDK_INCLUDE)',
          '<!(echo %OPENCL_HEADER%)'
        ],
        'library_dirs': [
          '<(AMD_OPENCL_SDK_LIB)'
        ],
        'defines': [
          'VC_EXTRALEAN'
        ],
        'libraries': [
          'OpenCL.lib'
        ]
      }]
    ]
  }]
}
